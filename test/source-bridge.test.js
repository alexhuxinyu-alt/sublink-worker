import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app/createApp.jsx';
import { createSession } from '../src/services/authService.js';

const host = 'https://converter.example';
const origin = 'https://monitor.example';
const token = 'local-test-only-' + 'x'.repeat(32);
const secret = 'local-test-session-secret';

async function setup(config = {}) {
    const app = createApp({
        config: { authUsername: 'test', authPassword: 'test-password', authSessionSecret: secret,
            sourceBridgeOrigin: origin, sourceBridgeToken: token, ...config }
    });
    const cookie = await createSession('test', secret, Date.now() + 60000);
    const admin = { Cookie: `sublink_session=${cookie}` };
    return { app, admin };
}

afterEach(() => vi.unstubAllGlobals());

describe('discovering private subscription sources', () => {
    it('protects the catalog and returns only the user-to-server map', async () => {
        const { app, admin } = await setup();
        const fetchBridge = vi.fn(async () => Response.json({
            users: [{ email: 'GCL', servers: [{ id: 'test-1', name: 'Server 1', apiKey: 'hidden' }], extra: 'hidden' }],
            unavailable: []
        }));
        vi.stubGlobal('fetch', fetchBridge);
        expect((await app.request(host + '/manage-source-catalog')).status).toBe(302);
        expect(fetchBridge).not.toHaveBeenCalled();
        const response = await app.request(host + '/manage-source-catalog', { headers: admin });
        expect(response.headers.get('Cache-Control')).toContain('no-store');
        expect(await response.json()).toEqual({ users: [{ email: 'GCL', servers: [{ id: 'test-1', name: 'Server 1' }] }], unavailable: [] });
        expect(fetchBridge.mock.calls[0][0].href).toBe(origin + '/api/integrations/sublink/catalog');
        expect(fetchBridge.mock.calls[0][1]).toMatchObject({
            redirect: 'manual',
            headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'Sublink-Source-Bridge/1.0' }
        });
    });

    it('requires same-origin lookup and returns only HTTPS sources for the requested servers', async () => {
        const { app, admin } = await setup();
        const fetchBridge = vi.fn(async () => Response.json({ sources: [
            { serverId: 'test-1', url: 'https://node.example/sub/fake' },
            { serverId: 'test-2', url: 'https://node.example/sub/different' },
            { serverId: 'test-3', url: 'http://node.example/sub/insecure' }
        ] }));
        vi.stubGlobal('fetch', fetchBridge);
        const body = JSON.stringify({ email: 'GCL', servers: ['test-1', 'test-3'] });
        const endpoint = host + '/manage-source-links';
        const headers = { ...admin, 'Content-Type': 'application/json' };
        expect((await app.request(endpoint, { method: 'POST', headers, body })).status).toBe(403);
        expect(fetchBridge).not.toHaveBeenCalled();
        const response = await app.request(endpoint, { method: 'POST', headers: { ...headers, Origin: host }, body });
        expect(await response.json()).toEqual({ sources: [{ serverId: 'test-1', url: 'https://node.example/sub/fake' }], unavailable: [] });
        expect(fetchBridge.mock.calls[0][0].href).toBe(origin + '/api/integrations/sublink/sources');
        expect(fetchBridge.mock.calls[0][1]).toMatchObject({ method: 'POST', body });
    });

    it('fails closed without admin authentication or after an upstream error', async () => {
        const fetchBridge = vi.fn(async () => Response.json({ error: 'private upstream detail' }, { status: 401 }));
        vi.stubGlobal('fetch', fetchBridge);
        const open = createApp({ config: { sourceBridgeOrigin: origin, sourceBridgeToken: token } });
        expect((await open.request(host + '/manage-source-catalog')).status).toBe(503);
        expect(fetchBridge).not.toHaveBeenCalled();
        const { app, admin } = await setup();
        const response = await app.request(host + '/manage-source-catalog', { headers: admin });
        expect(response.status).toBe(502);
        expect(await response.text()).not.toContain('private upstream detail');
    });

    it('rejects an upstream redirect without following it', async () => {
        const { app, admin } = await setup();
        const fetchBridge = vi.fn(async () => Response.redirect('https://elsewhere.example'));
        vi.stubGlobal('fetch', fetchBridge);
        const response = await app.request(host + '/manage-source-catalog', { headers: admin });
        expect(response.status).toBe(502);
        expect(fetchBridge.mock.calls[0][1].redirect).toBe('manual');
        expect(fetchBridge).toHaveBeenCalledTimes(1);
        expect(response.headers.has('Location')).toBe(false);
    });
});
