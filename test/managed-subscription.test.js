import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app/createApp.jsx';
import { MemoryKVAdapter } from '../src/adapters/kv/memoryKv.js';
import { createSession } from '../src/services/authService.js';

const secret = 'test-session-secret';
const original = '?config=https%3A%2F%2Fone.example%2Fsub&selectedRules=%5B%22google%22%5D&ua=Test';
const sourceB = 'https://two.example/sub';

async function setup() {
    const kv = new MemoryKVAdapter();
    await kv.put('ALEX_TEST', original);
    const app = createApp({ kv, config: { authUsername: 'tester', authPassword: 'test-password', authSessionSecret: secret } });
    const cookie = `sublink_session=${await createSession('tester', secret, Date.now() + 60000)}`;
    const request = (payload, headers = {}) => app.request('https://example.test/manage-subscription', {
        method: 'POST', headers: { Cookie: cookie, Origin: 'https://example.test', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload)
    });
    return { app, kv, request };
}

describe('managing existing subscriptions', () => {
    it('changes only the source list, preserves the address, and keeps a backup', async () => {
        const { app, kv, request } = await setup();
        const response = await request({ code: 'ALEX_TEST', originalQuery: original, sources: sourceB });
        expect(response.status).toBe(200);
        const saved = await kv.get('ALEX_TEST');
        const params = new URLSearchParams(saved);
        expect(params.get('config')).toBe(sourceB);
        expect(params.get('selectedRules')).toBe('["google"]');
        expect(params.get('ua')).toBe('Test');
        const backups = [...kv.store.entries()].filter(([key]) => key.startsWith('__subscription_backup__:ALEX_TEST:'));
        expect(backups).toHaveLength(1);
        expect(backups[0][1]).toBe(original);
        const redirect = await app.request('https://example.test/c/ALEX_TEST');
        expect(redirect.status).toBe(302);
        expect(new URL(redirect.headers.get('location')).searchParams.get('config')).toBe(sourceB);
    });

    it('rejects stale edits, unknown codes, empty sources, unauthenticated and cross-origin requests', async () => {
        const { app, kv, request } = await setup();
        expect((await request({ code: 'ALEX_TEST', originalQuery: '?config=stale', sources: sourceB })).status).toBe(409);
        expect((await request({ code: 'MISSING', originalQuery: original, sources: sourceB })).status).toBe(404);
        expect((await request({ code: 'ALEX_TEST', originalQuery: original, sources: ' ' })).status).toBe(400);
        expect((await request({ code: 'ALEX_TEST', originalQuery: original, sources: sourceB }, { Origin: 'https://other.test' })).status).toBe(403);
        const anonymous = await app.request('https://example.test/manage-subscription', { method: 'POST', headers: { Origin: 'https://example.test', 'Content-Type': 'application/json' }, body: '{}' });
        expect(anonymous.status).toBe(302);
        expect(await kv.get('ALEX_TEST')).toBe(original);
    });
});
