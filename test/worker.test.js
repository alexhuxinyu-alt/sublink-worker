import { describe, it, expect, vi } from 'vitest';
import { createApp } from '../src/app/createApp.jsx';
import { MemoryKVAdapter } from '../src/adapters/kv/memoryKv.js';

const createTestApp = (overrides = {}) => {
    const runtime = {
        kv: overrides.kv ?? new MemoryKVAdapter(),
        assetFetcher: overrides.assetFetcher ?? null,
        logger: console,
        config: {
            configTtlSeconds: 60,
            shortLinkTtlSeconds: null,
            ...(overrides.config || {})
        }
    };
    return createApp(runtime);
};

describe('Worker', () => {
    it('GET / returns HTML', async () => {
        const app = createTestApp();
        const res = await app.request('http://localhost/');
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/html');
        const text = await res.text();
        expect(text).toContain('Sublink Worker');
    });

    it('blocks administration with partial authentication while serving public subscriptions', async () => {
        const kv = new MemoryKVAdapter();
        await kv.put('example', '?config=test');
        const app = createTestApp({ kv, config: { authUsername: 'tester', authPassword: '' } });

        for (const path of ['/', '/manage-subscriptions', '/shorten-v2?url=https://example.test']) {
            const res = await app.request(path);
            expect(res.status).toBe(503);
            expect(res.headers.get('cache-control')).toBe('private, no-store');
            expect(res.headers.get('referrer-policy')).toBe('no-referrer');
        }
        expect((await app.request('/c/example')).status).toBe(302);
        expect((await app.request('/clash')).status).toBe(400);
    });

    it('treats malformed session cookies as signed out and preserves login responses', async () => {
        const app = createTestApp({ config: { authUsername: 'tester', authPassword: 'test-password', authSessionSecret: 'test-secret' } });
        const invalid = await app.request('/', { headers: { Cookie: 'sid=x; sublink_session=%E0%A4%A' } });
        expect(invalid.status).toBe(302);
        expect(invalid.headers.get('location')).toBe('/login');
        expect(invalid.headers.get('cache-control')).toBe('private, no-store');
        expect(invalid.headers.get('referrer-policy')).toBe('no-referrer');

        const login = await app.request('/login', {
            method: 'POST',
            body: new URLSearchParams({ username: 'tester', password: 'test-password' }),
        });
        expect(login.status).toBe(302);
        expect(login.headers.get('location')).toBe('/');
        expect(login.headers.get('cache-control')).toBe('private, no-store');
        expect(login.headers.get('referrer-policy')).toBe('no-referrer');
        const cookie = login.headers.get('set-cookie');
        expect(cookie).toMatch(/^sublink_session=\S+; Path=\/; HttpOnly; Secure; SameSite=Lax;/);
        const admin = await app.request('/', { headers: { Cookie: cookie.split(';')[0] } });
        expect(admin.status).toBe(200);
        expect(admin.headers.get('cache-control')).toBe('private, no-store');
    });

    it('protects subscription redirects and errors from browser referrers and caching', async () => {
        const kv = new MemoryKVAdapter();
        await kv.put('example', '?config=test');
        const app = createTestApp({ kv });
        const redirect = await app.request('/c/example');
        expect(redirect.status).toBe(302);
        expect(redirect.headers.get('location')).toBe('http://localhost/clash?config=test');
        const missing = await app.request('/c/missing');
        expect(missing.status).toBe(404);
        for (const res of [redirect, missing]) {
            expect(res.headers.get('cache-control')).toBe('private, no-store');
            expect(res.headers.get('referrer-policy')).toBe('no-referrer');
        }
    });

    it('only allows the designated static assets without login', async () => {
        const assetFetcher = vi.fn(async () => new Response('javascript', {
            headers: { 'Content-Type': 'text/javascript', 'Cache-Control': 'public, max-age=86400' },
        }));
        const app = createTestApp({ assetFetcher, config: { authUsername: 'tester', authPassword: 'test-password', authSessionSecret: 'test-secret' } });
        const allowed = await app.request('/vendor/js-yaml-4.3.2.min.js');
        expect(allowed.status).toBe(200);
        expect(allowed.headers.get('content-type')).toBe('text/javascript');
        expect(allowed.headers.get('cache-control')).toBe('public, max-age=86400');
        expect((await app.request('/vendor/other.js')).status).toBe(302);
        expect(assetFetcher).toHaveBeenCalledTimes(1);
    });

    it('protects reserved metadata from short-code creation and public resolution', async () => {
        const kv = new MemoryKVAdapter();
        const reserved = '__subscription_known_names__';
        await kv.put(reserved, '["example"]');
        const app = createTestApp({ kv });
        const url = encodeURIComponent('https://example.test/clash?config=test');

        expect((await app.request(`/shorten-v2?url=${url}&shortCode=${reserved}`)).status).toBe(400);
        expect((await app.request(`/shorten-v2?url=${url}&shortCode=invalid%2Fcode`)).status).toBe(400);
        expect((await app.request(`/c/${reserved}`)).status).toBe(404);
        expect(await kv.get(reserved)).toBe('["example"]');
    });

    it('blocks cross-site browser short-code creation and accepts valid custom codes', async () => {
        const kv = new MemoryKVAdapter();
        const app = createTestApp({ kv });
        const path = `/shorten-v2?url=${encodeURIComponent('https://example.test/clash?config=test')}&shortCode=user-1_mobile`;
        const blocked = await app.request(path, { headers: { 'Sec-Fetch-Site': 'cross-site' } });
        expect(blocked.status).toBe(403);
        expect(await kv.get('user-1_mobile')).toBeNull();

        const local = await app.request(path, { headers: { 'Sec-Fetch-Site': 'same-origin' } });
        expect(local.status).toBe(200);
        expect(await local.text()).toBe('user-1_mobile');
        expect((await app.request('/c/user-1_mobile')).headers.get('location')).toBe('http://localhost/clash?config=test');
    });

    it('GET /singbox returns JSON', async () => {
        const app = createTestApp();
        const config = 'vmess://ew0KICAidiI6ICIyIiwNCiAgInBzIjogInRlc3QiLA0KICAiYWRkIjogIjEuMS4xLjEiLA0KICAicG9ydCI6ICI0NDMiLA0KICAiaWQiOiAiYWRkNjY2NjYtODg4OC04ODg4LTg4ODgtODg4ODg4ODg4ODg4IiwNCiAgImFpZCI6ICIwIiwNCiAgInNjeSI6ICJhdXRvIiwNCiAgIm5ldCI6ICJ3cyIsDQogICJ0eXBlIjogIm5vbmUiLA0KICAiaG9zdCI6ICIiLA0KICAicGF0aCI6ICIvIiwNCiAgInRscyI6ICJ0bHMiDQp9';
        const res = await app.request(`http://localhost/singbox?config=${encodeURIComponent(config)}`);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('application/json');
        const json = await res.json();
        expect(json).toHaveProperty('outbounds');
    });

    it('GET /singbox returns legacy config for sing-box 1.11 UA', async () => {
        const app = createTestApp();
        const config = 'vmess://ew0KICAidiI6ICIyIiwNCiAgInBzIjogInRlc3QiLA0KICAiYWRkIjogIjEuMS4xLjEiLA0KICAicG9ydCI6ICI0NDMiLA0KICAiaWQiOiAiYWRkNjY2NjYtODg4OC04ODg4LTg4ODgtODg4ODg4ODg4ODg4IiwNCiAgImFpZCI6ICIwIiwNCiAgInNjeSI6ICJhdXRvIiwNCiAgIm5ldCI6ICJ3cyIsDQogICJ0eXBlIjogIm5vbmUiLA0KICAiaG9zdCI6ICIiLA0KICAicGF0aCI6ICIvIiwNCiAgInRscyI6ICJ0bHMiDQp9';
        const res = await app.request(`http://localhost/singbox?config=${encodeURIComponent(config)}`, {
            headers: {
                'User-Agent': 'SFI/1.12.2 (Build 2; sing-box 1.11.4; language zh_CN)'
            }
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json?.dns?.servers?.[0]).toHaveProperty('address');
        expect(json?.dns?.servers?.[0]).not.toHaveProperty('type');
        expect(json?.route).not.toHaveProperty('default_domain_resolver');
    });

    it('GET /singbox returns 1.12+ config for sing-box 1.12 UA', async () => {
        const app = createTestApp();
        const config = 'vmess://ew0KICAidiI6ICIyIiwNCiAgInBzIjogInRlc3QiLA0KICAiYWRkIjogIjEuMS4xLjEiLA0KICAicG9ydCI6ICI0NDMiLA0KICAiaWQiOiAiYWRkNjY2NjYtODg4OC04ODg4LTg4ODgtODg4ODg4ODg4ODg4IiwNCiAgImFpZCI6ICIwIiwNCiAgInNjeSI6ICJhdXRvIiwNCiAgIm5ldCI6ICJ3cyIsDQogICJ0eXBlIjogIm5vbmUiLA0KICAiaG9zdCI6ICIiLA0KICAicGF0aCI6ICIvIiwNCiAgInRscyI6ICJ0bHMiDQp9';
        const res = await app.request(`http://localhost/singbox?config=${encodeURIComponent(config)}`, {
            headers: {
                'User-Agent': 'SFA/1.12.12 (587; sing-box 1.12.12; language zh_Hans_CN)'
            }
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json?.dns?.servers?.[0]).toHaveProperty('type');
        expect(json?.dns?.servers?.[0]).not.toHaveProperty('address');
        expect(json?.route).toHaveProperty('default_domain_resolver', 'dns_resolver');
    });

    it('GET /clash returns YAML', async () => {
        const app = createTestApp();
        const config = 'vmess://ew0KICAidiI6ICIyIiwNCiAgInBzIjogInRlc3QiLA0KICAiYWRkIjogIjEuMS4xLjEiLA0KICAicG9ydCI6ICI0NDMiLA0KICAiaWQiOiAiYWRkNjY2NjYtODg4OC04ODg4LTg4ODgtODg4ODg4ODg4ODg4IiwNCiAgImFpZCI6ICIwIiwNCiAgInNjeSI6ICJhdXRvIiwNCiAgIm5ldCI6ICJ3cyIsDQogICJ0eXBlIjogIm5vbmUiLA0KICAiaG9zdCI6ICIiLA0KICAicGF0aCI6ICIvIiwNCiAgInRscyI6ICJ0bHMiDQp9';
        const res = await app.request(`http://localhost/clash?config=${encodeURIComponent(config)}`);
        expect(res.status).toBe(200);
        // Clash builder returns text/yaml
        expect(res.headers.get('content-type')).toContain('text/yaml');
        expect(res.headers.get('cache-control')).toBe('private, no-store');
        expect(res.headers.get('referrer-policy')).toBe('no-referrer');
        const text = await res.text();
        expect(text).toContain('proxies:');
    });

    it('GET /clash rejects empty url-test proxy groups with a diagnostic error', async () => {
        const app = createTestApp();
        const config = `
proxies:
  - name: Node-A
    type: ss
    server: a.example.com
    port: 443
    cipher: aes-128-gcm
    password: test
proxy-groups:
  - name: Empty Test Group
    type: url-test
    proxies: []
`;
        const res = await app.request(`http://localhost/clash?config=${encodeURIComponent(config)}`);

        expect(res.status).toBe(400);
        const text = await res.text();
        expect(text).toContain('Invalid proxy group "Empty Test Group"');
        expect(text).toContain('requires at least one proxy or provider reference');
    });

    it('GET /shorten-v2 returns short code', async () => {
        const url = 'http://example.com';
        const kvMock = {
            put: vi.fn(async () => {}),
            get: vi.fn(async () => null),
            delete: vi.fn(async () => {})
        };
        const app = createTestApp({ kv: kvMock });
        const res = await app.request(`http://localhost/shorten-v2?url=${encodeURIComponent(url)}`);
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(text).toBeTruthy();
        expect(kvMock.put).toHaveBeenCalled();
    });
});
