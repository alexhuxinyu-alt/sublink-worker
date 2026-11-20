/** @jsxRuntime automatic */
/** @jsxImportSource hono/jsx */
import { Hono } from 'hono';
import { Layout } from '../components/Layout.jsx';
import { Navbar } from '../components/Navbar.jsx';
import { Form } from '../components/Form.jsx';
import { Footer } from '../components/Footer.jsx';
import { UpdateChecker } from '../components/UpdateChecker.jsx';
import { Login } from '../components/Login.jsx';
import { SingboxConfigBuilder } from '../builders/SingboxConfigBuilder.js';
import { ClashConfigBuilder } from '../builders/ClashConfigBuilder.js';
import { SurgeConfigBuilder } from '../builders/SurgeConfigBuilder.js';
import { createTranslator, resolveLanguage } from '../i18n/index.js';
import { encodeBase64, tryDecodeSubscriptionLines } from '../utils.js';
import { APP_NAME, APP_SUBTITLE } from '../constants.js';
import { ShortLinkService } from '../services/shortLinkService.js';
import { ConfigStorageService } from '../services/configStorageService.js';
import { ServiceError, MissingDependencyError } from '../services/errors.js';
import { normalizeRuntime } from '../runtime/runtimeConfig.js';
import { createSession, credentialsMatch, verifySession } from '../services/authService.js';
import { PREDEFINED_RULE_SETS, UNIFIED_RULES, SING_BOX_CONFIG, SING_BOX_CONFIG_V1_11, generateSubconverterConfig } from '../config/index.js';

const DEFAULT_USER_AGENT = 'curl/7.74.0';
const BUILT_IN_RULE_NAMES = new Set(UNIFIED_RULES.map(rule => rule.name));
const STATIC_ASSET_PATHS = ['/favicon.ico', '/vendor/js-yaml-4.3.2.min.js'];
const SHORT_CODE_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function createApp(bindings = {}) {
    const runtime = normalizeRuntime(bindings);
    const services = {
        shortLinks: runtime.kv ? new ShortLinkService(runtime.kv, { shortLinkTtlSeconds: runtime.config.shortLinkTtlSeconds }) : null,
        configStorage: runtime.kv ? new ConfigStorageService(runtime.kv, { configTtlSeconds: runtime.config.configTtlSeconds }) : null
    };

    const app = new Hono();

    app.use('*', async (c, next) => {
        if (!STATIC_ASSET_PATHS.includes(c.req.path)) {
            c.header('Cache-Control', 'private, no-store');
            c.header('Referrer-Policy', 'no-referrer');
        }
        await next();
    });

    app.use('*', async (c, next) => {
        if (STATIC_ASSET_PATHS.includes(c.req.path) || isPublicSubscriptionRoute(c.req.path) || c.req.path === '/login' || c.req.path === '/logout') return next();
        if (!isAuthConfigured(runtime.config)) {
            if (hasAuthSettings(runtime.config)) return c.text('Authentication is not fully configured.', 503);
            return next();
        }
        const session = readCookie(c.req.header('Cookie'), 'sublink_session');
        return await verifySession(session, runtime.config.authSessionSecret) ? next() : c.redirect('/login');
    });

    app.use('*', async (c, next) => {
        const acceptLanguage = getRequestHeader(c.req, 'Accept-Language');
        const lang = c.req.query('lang') || acceptLanguage?.split(',')[0] || 'zh-CN';
        c.set('lang', lang);
        c.set('t', createTranslator(lang));
        await next();
    });

    app.get('/login', (c) => c.html(<Login error={c.req.query('error') === '1'} />));
    app.post('/login', async (c) => {
        if (!isAuthConfigured(runtime.config)) return c.text('Authentication is not configured.', 503);
        const body = await c.req.parseBody();
        const username = typeof body.username === 'string' ? body.username : '';
        const password = typeof body.password === 'string' ? body.password : '';
        if (!await credentialsMatch(username, password, runtime.config.authUsername, runtime.config.authPassword)) return c.redirect('/login?error=1');
        const seconds = runtime.config.authSessionHours * 60 * 60;
        const session = await createSession(username, runtime.config.authSessionSecret, Date.now() + seconds * 1000);
        c.header('Set-Cookie', serializeCookie('sublink_session', session, seconds));
        return c.redirect('/');
    });
    app.post('/logout', (c) => {
        c.header('Set-Cookie', serializeCookie('sublink_session', '', 0));
        return c.redirect('/login');
    });

    app.get('/', (c) => {
        const t = c.get('t');
        const lang = resolveLanguage(c.get('lang'));
        const subtitle = APP_SUBTITLE[lang] || APP_SUBTITLE['zh-CN'];

        return c.html(
            <Layout title={t('pageTitle')} description={t('pageDescription')} keywords={t('pageKeywords')} lang={lang}>
                <div class="flex flex-col min-h-screen">
                    <Navbar />
                    <main class="flex-1">
                        <div class="mx-auto max-w-4xl px-4 pb-8 pt-24 sm:px-6 sm:pt-28">
                            <header class="mb-7 text-center sm:mb-10">
                                <h1 class="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-5xl">
                                    {APP_NAME}
                                </h1>
                                <p class="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-gray-600 dark:text-gray-300 sm:mt-3 sm:text-base">
                                    {subtitle}
                                </p>
                            </header>
                            <Form t={t} lang={lang} />
                        </div>
                    </main>
                    <Footer />
                    <UpdateChecker />
                </div>
            </Layout>
        );
    });

    app.get('/singbox', async (c) => {
        try {
            const config = c.req.query('config');
            if (!config) {
                return c.text('Missing config parameter', 400);
            }

            const selectedRules = parseSelectedRules(c.req.query('selectedRules'));
            const customRules = parseJsonArray(c.req.query('customRules'));
            const ua = c.req.query('ua') || getRequestHeader(c.req, 'User-Agent') || DEFAULT_USER_AGENT;
            const groupByCountry = parseBooleanFlag(c.req.query('group_by_country'));
            const includeAutoSelect = c.req.query('include_auto_select') !== 'false';
            const enableClashUI = parseBooleanFlag(c.req.query('enable_clash_ui'));
            const externalController = c.req.query('external_controller');
            const externalUiDownloadUrl = c.req.query('external_ui_download_url');
            const configId = c.req.query('configId');
            const lang = c.get('lang');

            const requestedSingboxVersion = c.req.query('singbox_version') || c.req.query('sb_version') || c.req.query('sb_ver');
            const requestUserAgent = getRequestHeader(c.req, 'User-Agent');
            const singboxConfigVersion = resolveSingboxConfigVersion(requestedSingboxVersion, requestUserAgent);

            let baseConfig = singboxConfigVersion === '1.11' ? SING_BOX_CONFIG_V1_11 : SING_BOX_CONFIG;
            if (configId) {
                const storage = requireConfigStorage(services.configStorage);
                const storedConfig = await storage.getConfigById(configId);
                if (storedConfig) {
                    baseConfig = storedConfig;
                }
            }

            const builder = new SingboxConfigBuilder(
                config,
                selectedRules,
                customRules,
                baseConfig,
                lang,
                ua,
                groupByCountry,
                enableClashUI,
                externalController,
                externalUiDownloadUrl,
                singboxConfigVersion,
                includeAutoSelect
            );
            await builder.build();
            const userinfo = builder.getSubscriptionUserinfo();
            if (userinfo) {
                c.header('subscription-userinfo', userinfo);
            }
            return c.json(builder.config);
        } catch (error) {
            return handleError(c, error, runtime.logger);
        }
    });

    app.get('/clash', async (c) => {
        try {
            const config = c.req.query('config');
            if (!config) {
                return c.text('Missing config parameter', 400);
            }

            const selectedRules = parseSelectedRules(c.req.query('selectedRules'));
            const customRules = parseJsonArray(c.req.query('customRules'));
            const ua = c.req.query('ua') || getRequestHeader(c.req, 'User-Agent') || DEFAULT_USER_AGENT;
            const groupByCountry = parseBooleanFlag(c.req.query('group_by_country'));
            const includeAutoSelect = c.req.query('include_auto_select') !== 'false';
            const enableClashUI = parseBooleanFlag(c.req.query('enable_clash_ui'));
            const externalController = c.req.query('external_controller');
            const externalUiDownloadUrl = c.req.query('external_ui_download_url');
            const configId = c.req.query('configId');
            const lang = c.get('lang');

            let baseConfig;
            if (configId) {
                const storage = requireConfigStorage(services.configStorage);
                baseConfig = await storage.getConfigById(configId);
            }

            const builder = new ClashConfigBuilder(
                config,
                selectedRules,
                customRules,
                baseConfig,
                lang,
                ua,
                groupByCountry,
                enableClashUI,
                externalController,
                externalUiDownloadUrl,
                includeAutoSelect
            );
            await builder.build();
            const userinfo = builder.getSubscriptionUserinfo();
            const headers = { 'Content-Type': 'text/yaml; charset=utf-8' };
            if (userinfo) {
                headers['subscription-userinfo'] = userinfo;
            }
            return c.text(builder.formatConfig(), 200, headers);
        } catch (error) {
            return handleError(c, error, runtime.logger);
        }
    });

    app.get('/surge', async (c) => {
        try {
            const config = c.req.query('config');
            if (!config) {
                return c.text('Missing config parameter', 400);
            }

            const selectedRules = parseSelectedRules(c.req.query('selectedRules'));
            const customRules = parseJsonArray(c.req.query('customRules'));
            const ua = c.req.query('ua') || getRequestHeader(c.req, 'User-Agent') || DEFAULT_USER_AGENT;
            const groupByCountry = parseBooleanFlag(c.req.query('group_by_country'));
            const includeAutoSelect = c.req.query('include_auto_select') !== 'false';
            const configId = c.req.query('configId');
            const lang = c.get('lang');

            let baseConfig;
            if (configId) {
                const storage = requireConfigStorage(services.configStorage);
                baseConfig = await storage.getConfigById(configId);
            }

            const builder = new SurgeConfigBuilder(
                config,
                selectedRules,
                customRules,
                baseConfig,
                lang,
                ua,
                groupByCountry,
                includeAutoSelect
            );
            builder.setSubscriptionUrl(c.req.url);
            await builder.build();

            const userinfo = builder.getSubscriptionUserinfo();
            if (userinfo) {
                c.header('subscription-userinfo', userinfo);
            }
            return c.text(builder.formatConfig());
        } catch (error) {
            return handleError(c, error, runtime.logger);
        }
    });

    app.get('/subconverter', (c) => {
        try {
            const rawSelectedRules = c.req.query('selectedRules');
            let selectedRules;

            if (!rawSelectedRules) {
                selectedRules = PREDEFINED_RULE_SETS.balanced;
            } else if (PREDEFINED_RULE_SETS[rawSelectedRules]) {
                selectedRules = PREDEFINED_RULE_SETS[rawSelectedRules];
            } else {
                try {
                    const parsed = JSON.parse(rawSelectedRules);
                    if (Array.isArray(parsed)) {
                        selectedRules = parsed;
                    } else {
                        return c.text('Invalid selectedRules: must be a preset name (minimal, balanced, comprehensive) or a JSON array', 400);
                    }
                } catch {
                    return c.text(`Invalid selectedRules: "${rawSelectedRules}" is not a valid preset name or JSON array. Valid presets: minimal, balanced, comprehensive`, 400);
                }
            }

            const includeAutoSelect = c.req.query('include_auto_select') !== 'false';
            const groupByCountry = parseBooleanFlag(c.req.query('group_by_country'));
            const customRules = parseJsonArray(c.req.query('customRules'));
            const lang = c.get('lang');

            const config = generateSubconverterConfig({
                selectedRules,
                customRules,
                lang,
                includeAutoSelect,
                groupByCountry
            });

            return c.text(config, 200, {
                'Content-Type': 'text/plain; charset=utf-8'
            });
        } catch (error) {
            return handleError(c, error, runtime.logger);
        }
    });

    app.get('/xray', async (c) => {
        const inputString = c.req.query('config');
        if (!inputString) {
            return c.text('Missing config parameter', 400);
        }

        const proxylist = inputString.split('\n');
        const finalProxyList = [];
        let subscriptionUserinfo;
        const userAgent = c.req.query('ua') || getRequestHeader(c.req, 'User-Agent') || DEFAULT_USER_AGENT;
        const headers = { 'User-Agent': userAgent };

        for (const proxy of proxylist) {
            const trimmedProxy = proxy.trim();
            if (!trimmedProxy) continue;

            if (trimmedProxy.startsWith('http://') || trimmedProxy.startsWith('https://')) {
                try {
                    const response = await fetch(trimmedProxy, { method: 'GET', headers });
                    const fetchedUserinfo = response.headers.get('subscription-userinfo');
                    if (fetchedUserinfo && subscriptionUserinfo === undefined) {
                        subscriptionUserinfo = fetchedUserinfo;
                    }
                    const text = await response.text();
                    let processed = tryDecodeSubscriptionLines(text, { decodeUriComponent: true });
                    if (!Array.isArray(processed)) processed = [processed];
                    finalProxyList.push(...processed.filter(item => typeof item === 'string' && item.trim() !== ''));
                } catch (e) {
                    runtime.logger.warn('Failed to fetch the proxy', e);
                }
            } else {
                let processed = tryDecodeSubscriptionLines(trimmedProxy);
                if (!Array.isArray(processed)) processed = [processed];
                finalProxyList.push(...processed.filter(item => typeof item === 'string' && item.trim() !== ''));
            }
        }

        const finalString = finalProxyList.join('\n');
        if (!finalString) {
            return c.text('Missing config parameter', 400);
        }

        const responseHeaders = {};
        if (subscriptionUserinfo) {
            responseHeaders['subscription-userinfo'] = subscriptionUserinfo;
        }

        return c.text(encodeBase64(finalString), 200, responseHeaders);
    });

    app.get('/shorten-v2', async (c) => {
        if (c.req.header('Sec-Fetch-Site') === 'cross-site') return c.text('Cross-site request is not allowed', 403);
        try {
            const customCode = c.req.query('shortCode');
            if (customCode && (!SHORT_CODE_PATTERN.test(customCode) || customCode.length > 128 || customCode.startsWith('__'))) {
                return c.text('Invalid short code', 400);
            }
            const url = c.req.query('url');
            if (!url) {
                return c.text('Missing URL parameter', 400);
            }
            let parsedUrl;
            try {
                parsedUrl = new URL(url);
            } catch {
                return c.text('Invalid URL parameter', 400);
            }
            const queryString = parsedUrl.search;

            const shortLinks = requireShortLinkService(services.shortLinks);
            const code = await shortLinks.createShortLink(queryString, customCode);
            return c.text(code);
        } catch (error) {
            return handleError(c, error, runtime.logger);
        }
    });

    app.get('/manage-subscriptions', async (c) => {
        if (!isAuthConfigured(runtime.config)) return c.text('Authentication is required', 503);
        if (!runtime.kv || typeof runtime.kv.list !== 'function') return c.text('Listing is not available for this storage', 501);
        try {
            const cursor = c.req.query('cursor');
            if (cursor && cursor.length > 1024) return c.text('Invalid cursor', 400);
            const page = await runtime.kv.list({ limit: 20, ...(cursor ? { cursor } : {}) });
            let knownNames = [];
            try {
                const stored = JSON.parse(await runtime.kv.get('__subscription_known_names__') || '[]');
                if (Array.isArray(stored)) knownNames = stored.filter(n => typeof n === 'string' && /^[a-zA-Z0-9_-]{1,40}$/.test(n)).sort((a, b) => b.length - a.length);
            } catch { /* Invalid metadata should not prevent subscription management. */ }
            const entries = await Promise.all(page.keys.map(async ({ name }) => {
                if (!/^[a-zA-Z0-9_-]{1,128}$/.test(name) || name === 'TEST_258e5ba3d8693cf828a5e880') return null;
                const value = await runtime.kv.get(name);
                if (typeof value !== 'string' || !value.startsWith('?')) return null;
                const params = new URLSearchParams(value);
                if (!params.has('config')) return null;
                let remark = '';
                try { const stored = JSON.parse(await runtime.kv.get(`__subscription_remark__:${name}`) || '""'); if (typeof stored === 'string') remark = stored; } catch { /* Ignore invalid metadata. */ }
                const inferredName = knownNames.find(n => name.length > n.length && name.toLowerCase().startsWith(n.toLowerCase())) || null;
                return { code: name, displayName: remark || inferredName, inferredName, remark, disabled: params.get('config') === 'disabled' };
            }));
            return c.json({ entries: entries.filter(Boolean), knownNames, cursor: page.list_complete ? null : page.cursor });
        } catch (error) {
            return handleError(c, error, runtime.logger);
        }
    });

    app.post('/manage-subscription-names', async (c) => {
        if (!isAuthConfigured(runtime.config)) return c.text('Authentication is required', 503);
        if (c.req.header('Origin') !== new URL(c.req.url).origin) return c.text('Invalid origin', 403);
        if (!(c.req.header('Content-Type') || '').toLowerCase().startsWith('application/json')) return c.text('Invalid content type', 415);
        try {
            const { names } = await c.req.json();
            if (!Array.isArray(names) || names.length > 200 || names.some(n => typeof n !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(n))) return c.text('Invalid names', 400);
            const unique = [...new Map(names.map(n => [n.toLowerCase(), n])).values()];
            await runtime.kv.put('__subscription_known_names__', JSON.stringify(unique));
            return c.json({ saved: true });
        } catch (error) { return handleError(c, error, runtime.logger); }
    });

    app.post('/manage-subscription-remark', async (c) => {
        if (!isAuthConfigured(runtime.config)) return c.text('Authentication is required', 503);
        if (c.req.header('Origin') !== new URL(c.req.url).origin) return c.text('Invalid origin', 403);
        if (!(c.req.header('Content-Type') || '').toLowerCase().startsWith('application/json')) return c.text('Invalid content type', 415);
        try {
            const { code, remark } = await c.req.json();
            if (typeof code !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(code) || typeof remark !== 'string' || remark.length > 80 || /[\u0000-\u001f\u007f]/.test(remark)) return c.text('Invalid remark', 400);
            const current = await requireShortLinkService(services.shortLinks).resolveShortCode(code);
            if (!current || !new URLSearchParams(current).has('config')) return c.text('Subscription not found', 404);
            await runtime.kv.put(`__subscription_remark__:${code}`, JSON.stringify(remark.trim()));
            return c.json({ saved: true });
        } catch (error) { return handleError(c, error, runtime.logger); }
    });

    app.post('/manage-subscription-delete', async (c) => {
        if (!isAuthConfigured(runtime.config)) return c.text('Authentication is required', 503);
        if (c.req.header('Origin') !== new URL(c.req.url).origin) return c.text('Invalid origin', 403);
        const contentType = c.req.header('Content-Type')?.split(';', 1)[0].trim().toLowerCase();
        if (contentType !== 'application/json') return c.text('Invalid content type', 415);
        try {
            const code = (await c.req.json())?.code;
            if (typeof code !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(code)) return c.text('Invalid short code', 400);

            const service = requireShortLinkService(services.shortLinks);
            const current = await service.resolveShortCode(code);
            if (typeof current !== 'string' || !current.startsWith('?') || !new URLSearchParams(current).has('config')) {
                return c.text('Subscription not found', 404);
            }

            const remarkKey = `__subscription_remark__:${code}`;
            const remark = await runtime.kv.get(remarkKey);
            // Keep a short recovery window without keeping a deleted subscription publicly accessible.
            const backupKey = `__subscription_deleted__:${code}:${Date.now()}:${crypto.randomUUID()}`;
            await runtime.kv.put(backupKey, JSON.stringify({ query: current, remark }), { expirationTtl: 30 * 24 * 60 * 60 });
            if (await service.resolveShortCode(code) !== current) return c.text('Subscription changed; reload before deleting', 409);
            await runtime.kv.delete(code);
            if (remark !== null) {
                try {
                    await runtime.kv.delete(remarkKey);
                } catch {
                    runtime.logger.warn?.('Deleted short link but could not remove its remark');
                }
            }
            return c.json({ deleted: true });
        } catch (error) {
            if (error instanceof SyntaxError) return c.text('Invalid JSON', 400);
            return handleError(c, error, runtime.logger);
        }
    });

    // Keep the same short code so existing clients can use the updated subscription.
    app.post('/manage-subscription', async (c) => {
        if (!isAuthConfigured(runtime.config)) return c.text('Authentication is required', 503);
        if (c.req.header('Origin') !== new URL(c.req.url).origin) return c.text('Invalid origin', 403);
        if (!(c.req.header('Content-Type') || '').toLowerCase().startsWith('application/json')) return c.text('Invalid content type', 415);
        try {
            const { code, originalQuery, sources, selectedRules } = await c.req.json();
            if (typeof code !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(code) ||
                typeof originalQuery !== 'string' || !originalQuery.startsWith('?') || originalQuery.length > 64000 ||
                typeof sources !== 'string' || !sources.trim() || sources.length > 48000) {
                return c.text('Invalid subscription data', 400);
            }
            if (selectedRules !== undefined &&
                (!Array.isArray(selectedRules) || selectedRules.length === 0 || selectedRules.some(name => !BUILT_IN_RULE_NAMES.has(name)))) {
                return c.text('Invalid built-in rules', 400);
            }
            const service = requireShortLinkService(services.shortLinks);
            const current = await service.resolveShortCode(code);
            if (!current) return c.text('Subscription not found', 404);
            if (current !== originalQuery) return c.text('Subscription changed; reload before saving', 409);
            const params = new URLSearchParams(current);
            if (!params.has('config')) return c.text('Subscription has no editable sources', 400);
            params.set('config', sources.trim());
            if (selectedRules !== undefined) params.set('selectedRules', JSON.stringify([...new Set(selectedRules)]));
            const updatedQuery = `?${params.toString()}`;
            if (updatedQuery === current) return c.json({ updated: false });
            // A separate backup makes accidental subscription edits recoverable.
            const backupKey = `__subscription_backup__:${code}:${Date.now()}:${crypto.randomUUID()}`;
            await runtime.kv.put(backupKey, current);
            if (await service.resolveShortCode(code) !== current) return c.text('Subscription changed; reload before saving', 409);
            await service.createShortLink(updatedQuery, code);
            return c.json({ updated: true });
        } catch (error) {
            if (error instanceof SyntaxError) return c.text('Invalid JSON', 400);
            return handleError(c, error, runtime.logger);
        }
    });

    const redirectHandler = (prefix) => async (c) => {
        try {
            const code = c.req.param('code');
            if (!SHORT_CODE_PATTERN.test(code)) return c.text('Short URL not found', 404);
            const shortLinks = requireShortLinkService(services.shortLinks);
            const originalParam = await shortLinks.resolveShortCode(code);
            if (typeof originalParam !== 'string' || !originalParam.startsWith('?')) return c.text('Short URL not found', 404);

            const url = new URL(c.req.url);
            return c.redirect(`${url.origin}/${prefix}${originalParam}`);
        } catch (error) {
            return handleError(c, error, runtime.logger);
        }
    };

    app.get('/s/:code', redirectHandler('surge'));
    app.get('/b/:code', redirectHandler('singbox'));
    app.get('/c/:code', redirectHandler('clash'));
    app.get('/x/:code', redirectHandler('xray'));

    app.post('/config', async (c) => {
        try {
            const { type, content } = await c.req.json();
            const storage = requireConfigStorage(services.configStorage);
            const configId = await storage.saveConfig(type, content);
            return c.text(configId);
        } catch (error) {
            if (error instanceof SyntaxError) {
                return c.text(`Invalid format: ${error.message}`, 400);
            }
            return handleError(c, error, runtime.logger);
        }
    });

    app.get('/resolve', async (c) => {
        try {
            const shortUrl = c.req.query('url');
            const t = c.get('t');
            if (!shortUrl) return c.text(t('missingUrl'), 400);

            let urlObj;
            try {
                urlObj = new URL(shortUrl);
            } catch {
                return c.text(t('invalidShortUrl'), 400);
            }
            const pathParts = urlObj.pathname.split('/');
            if (pathParts.length < 3) return c.text(t('invalidShortUrl'), 400);

            const prefix = pathParts[1];
            const shortCode = pathParts[2];
            if (!['b', 'c', 'x', 's'].includes(prefix) || !SHORT_CODE_PATTERN.test(shortCode)) return c.text(t('invalidShortUrl'), 400);

            const shortLinks = requireShortLinkService(services.shortLinks);
            const originalParam = await shortLinks.resolveShortCode(shortCode);
            if (typeof originalParam !== 'string' || !originalParam.startsWith('?')) return c.text(t('shortUrlNotFound'), 404);

            const mapping = { b: 'singbox', c: 'clash', x: 'xray', s: 'surge' };
            const originalUrl = `${urlObj.origin}/${mapping[prefix]}${originalParam}`;
            return c.json({ originalUrl });
        } catch (error) {
            return handleError(c, error, runtime.logger);
        }
    });

    const fetchStaticAsset = async (c) => {
        if (!runtime.assetFetcher) {
            return c.notFound();
        }
        try {
            return await runtime.assetFetcher(c.req.raw);
        } catch (error) {
            runtime.logger.warn('Asset fetch failed', error);
            return c.notFound();
        }
    };
    for (const path of STATIC_ASSET_PATHS) app.get(path, fetchStaticAsset);

    return app;
}

export function parseSelectedRules(raw) {
    if (!raw) return [];

    // 首先检查是否是预设名称 (minimal, balanced, comprehensive)
    // 这确保向后兼容主分支的 API 行为
    if (typeof raw === 'string' && PREDEFINED_RULE_SETS[raw]) {
        return PREDEFINED_RULE_SETS[raw];
    }

    // 尝试解析为 JSON 数组
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        // 解析失败，回退到 minimal 预设
        console.warn(`Failed to parse selectedRules: ${raw}, falling back to minimal`);
        return PREDEFINED_RULE_SETS.minimal;
    }
}

function parseJsonArray(raw) {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function parseBooleanFlag(value) {
    return value === 'true' || value === true;
}

function isAuthConfigured(config) { return Boolean(config.authUsername && config.authPassword && config.authSessionSecret); }
function hasAuthSettings(config) {
    return [config.authUsername, config.authPassword, config.authSessionSecret].some(value => value != null);
}
function isPublicSubscriptionRoute(path) { return ['/singbox', '/clash', '/surge', '/xray'].includes(path) || /^\/[bcxs]\/[a-zA-Z0-9_-]+$/.test(path); }
function readCookie(header, name) {
    if (!header) return null;
    const prefix = `${name}=`;
    const cookie = header.split(';').map(value => value.trim()).find(value => value.startsWith(prefix));
    if (!cookie) return null;
    try {
        return decodeURIComponent(cookie.slice(prefix.length));
    } catch {
        return null;
    }
}
function serializeCookie(name, value, maxAge) { return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`; }

function parseSemverLike(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    const match = trimmed.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
    if (!match) {
        return null;
    }
    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: match[3] ? Number(match[3]) : 0
    };
}

function isSingboxLegacyConfig(version) {
    if (!version || Number.isNaN(version.major) || Number.isNaN(version.minor)) {
        return false;
    }
    if (version.major !== 1) {
        return version.major < 1;
    }
    return version.minor < 12;
}

// 1.14 swaps rule-set download_detour for http_client, which older clients
// reject as an unknown field, so it needs its own config tier.
function isSingboxModernConfig(version) {
    if (!version || Number.isNaN(version.major) || Number.isNaN(version.minor)) {
        return false;
    }
    if (version.major !== 1) {
        return version.major > 1;
    }
    return version.minor >= 14;
}

function resolveSingboxConfigTier(version) {
    if (isSingboxLegacyConfig(version)) return '1.11';
    return isSingboxModernConfig(version) ? '1.14' : '1.12';
}

function resolveSingboxConfigVersion(requestedVersion, userAgent) {
    const normalizedRequested = typeof requestedVersion === 'string' ? requestedVersion.trim().toLowerCase() : '';
    if (normalizedRequested && normalizedRequested !== 'auto') {
        if (normalizedRequested === 'legacy') return '1.11';
        if (normalizedRequested === 'latest') return '1.14';
        const parsed = parseSemverLike(normalizedRequested);
        if (parsed) {
            return resolveSingboxConfigTier(parsed);
        }
    }

    if (typeof userAgent === 'string' && userAgent) {
        const uaMatch = userAgent.match(/sing-box\/(\d+\.\d+(?:\.\d+)?)/i) || userAgent.match(/sing-box\s+(\d+\.\d+(?:\.\d+)?)/i);
        const versionString = uaMatch?.[1];
        const parsed = versionString ? parseSemverLike(versionString) : null;
        if (parsed) {
            return resolveSingboxConfigTier(parsed);
        }
    }

    return '1.12';
}

function getRequestHeader(request, name) {
    if (!request || !name) {
        return undefined;
    }

    try {
        const value = request.header(name);
        if (value !== undefined) {
            return value;
        }
    } catch {
        // Fallback if HonoRequest.header cannot read from the raw request.
    }

    const headers = request.raw?.headers;
    if (!headers) {
        return undefined;
    }

    if (typeof headers.get === 'function') {
        return headers.get(name) ?? headers.get(name.toLowerCase()) ?? undefined;
    }

    if (typeof headers === 'object') {
        const lowerName = name.toLowerCase();
        const headerValue = headers[lowerName] ?? headers[name];
        if (Array.isArray(headerValue)) {
            return headerValue[0];
        }
        return headerValue;
    }

    return undefined;
}

function requireShortLinkService(service) {
    if (!service) {
        throw new MissingDependencyError('Short link functionality is unavailable');
    }
    return service;
}

function requireConfigStorage(service) {
    if (!service) {
        throw new MissingDependencyError('Config storage functionality is unavailable');
    }
    return service;
}

function handleError(c, error, logger) {
    if (error instanceof ServiceError) {
        return c.text(error.message, error.status);
    }
    logger.error?.('Unhandled error', error);
    return c.text(`Error: ${error.message}`, 500);
}
