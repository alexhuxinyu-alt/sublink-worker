import { describe, it, expect, vi } from 'vitest';
import yaml from 'js-yaml';
import { createApp } from '../src/app/createApp.jsx';
import { MemoryKVAdapter } from '../src/adapters/kv/memoryKv.js';

describe('existing subscription compatibility', () => {
    it('keeps the management page protected while resolving legacy short links', async () => {
        const kv = new MemoryKVAdapter();
        await kv.put('ALEXtest123', '?config=example');
        const app = createApp({ kv, config: { authUsername: 'test', authPassword: 'test', authSessionSecret: 'test-secret' } });
        const home = await app.request('https://example.test/');
        expect(home.status).toBe(302);
        expect(home.headers.get('location')).toBe('/login');
        const link = await app.request('https://example.test/c/ALEXtest123');
        expect(link.status).toBe(302);
        expect(link.headers.get('location')).toBe('https://example.test/clash?config=example');
        for (const [prefix, format] of [['b', 'singbox'], ['x', 'xray'], ['s', 'surge']]) {
            const result = await app.request(`https://example.test/${prefix}/ALEXtest123`);
            expect(result.status).toBe(302);
            expect(result.headers.get('location')).toBe(`https://example.test/${format}?config=example`);
        }
    });
    it('fails closed when authentication settings are incomplete', async () => {
        const app = createApp({ kv: new MemoryKVAdapter(), config: { authUsername: 'test' } });
        expect((await app.request('https://example.test/')).status).toBe(503);
    });
    it('accepts valid login and rejects malformed session cookies', async () => {
        const app = createApp({ kv: new MemoryKVAdapter(), config: { authUsername: 'tester', authPassword: 'password', authSessionSecret: 'test-secret', authSessionHours: 24 } });
        const bad = await app.request('https://example.test/', { headers: { Cookie: 'sublink_session=%E0%A4%A' } });
        expect(bad.status).toBe(302);
        const login = await app.request('https://example.test/login', { method: 'POST', body: new URLSearchParams({ username: 'tester', password: 'password' }) });
        expect(login.status).toBe(302);
        const cookie = login.headers.get('set-cookie');
        expect(cookie).toContain('HttpOnly; Secure; SameSite=Lax');
        expect((await app.request('https://example.test/', { headers: { Cookie: cookie.split(';')[0] } })).status).toBe(200);
    });
    it('rejects cross-site short link changes and invalid names', async () => {
        const app = createApp({ kv: new MemoryKVAdapter() });
        const crossSite = await app.request('https://example.test/shorten-v2', { method: 'POST', headers: { 'Sec-Fetch-Site': 'cross-site', 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://example.test/clash?config=x' }) });
        expect(crossSite.status).toBe(403);
        const invalid = await app.request('https://example.test/shorten-v2', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://example.test/clash?config=x', shortCode: '__internal' }) });
        expect(invalid.status).toBe(400);
    });
    it('refreshes Clash source nodes through the same legacy link', async () => {
        const kv = new MemoryKVAdapter();
        await kv.put('legacy123', '?config=' + encodeURIComponent('https://source.example/sub'));
        const app = createApp({ kv });
        let nodes = [{ name: 'Node A', type: 'vless', server: 'node.example', port: 443, uuid: '5b7eec2f-ce59-4ea7-b957-0a6fc33de246', tls: true }];
        vi.stubGlobal('fetch', vi.fn(async () => new Response(yaml.dump({ proxies: nodes }))));
        try {
            for (const name of ['Node A', 'Node B']) {
                nodes = [{ ...nodes[0], name }];
                const redirect = await app.request('https://example.test/c/legacy123');
                const output = await app.request(redirect.headers.get('location'));
                expect(output.status).toBe(200);
                const config = yaml.load(await output.text());
                expect(config.proxies.map(p => p.name)).toContain(name);
                expect(config['proxy-providers'] ?? {}).toEqual({});
            }
        } finally { vi.unstubAllGlobals(); }
    });
});
