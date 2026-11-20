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
    it('lists existing subscriptions only for authenticated users and omits backups and config files', async () => {
        const { app, kv } = await setup();
        await kv.put('__subscription_backup__:ALEX_TEST:1:test', original);
        await kv.put('clash_random', '{"dns":{}}');
        const cookie = `sublink_session=${await createSession('tester', secret, Date.now() + 60000)}`;
        const response = await app.request('https://example.test/manage-subscriptions', { headers: { Cookie: cookie } });
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect((await response.json()).entries).toEqual([{ code: 'ALEX_TEST', displayName: null, remark: '', disabled: false }]);
        expect((await app.request('https://example.test/manage-subscriptions')).status).toBe(302);
    });

    it('uses the longest configured name prefix, and protects name updates', async () => {
        const { app, kv } = await setup();
        await kv.put('CSMF9D5Y7B6', original);
        const cookie = `sublink_session=${await createSession('tester', secret, Date.now() + 60000)}`;
        const url = 'https://example.test/manage-subscription-names';
        const headers = { Cookie: cookie, Origin: 'https://example.test', 'Content-Type': 'application/json' };
        expect((await app.request(url, { method: 'POST', headers: { ...headers, Origin: 'https://elsewhere.test' }, body: JSON.stringify({names:['CSM']}) })).status).toBe(403);
        expect((await app.request(url, { method: 'POST', headers, body: JSON.stringify({names:['C','CSM','Alex']}) })).status).toBe(200);
        const entries = (await (await app.request('https://example.test/manage-subscriptions', { headers: { Cookie: cookie } })).json()).entries;
        expect(entries.find(x => x.code === 'CSMF9D5Y7B6').displayName).toBe('CSM');
        expect(entries.find(x => x.code === 'ALEX_TEST').displayName).toBe('Alex');
    });

    it('stores private remarks separately, overrides the inferred name, and leaves the subscription intact', async () => {
        const { app, kv } = await setup();
        const cookie = `sublink_session=${await createSession('tester', secret, Date.now() + 60000)}`;
        const headers = { Cookie: cookie, Origin: 'https://example.test', 'Content-Type': 'application/json' };
        const url = 'https://example.test/manage-subscription-remark';
        const body = JSON.stringify({ code: 'ALEX_TEST', remark: '家人手机' });
        expect((await app.request(url, { method: 'POST', headers: { ...headers, Origin: 'https://elsewhere.test' }, body })).status).toBe(403);
        expect((await app.request(url, { method: 'POST', headers: { Origin: 'https://example.test', 'Content-Type': 'application/json' }, body })).status).toBe(302);
        expect((await app.request(url, { method: 'POST', headers, body })).status).toBe(200);
        const entries = (await (await app.request('https://example.test/manage-subscriptions', { headers: { Cookie: cookie } })).json()).entries;
        expect(entries.find(x => x.code === 'ALEX_TEST')).toMatchObject({ displayName: '家人手机', remark: '家人手机' });
        expect(await kv.get('ALEX_TEST')).toBe(original);
        expect((await app.request(url, { method: 'POST', headers, body: JSON.stringify({ code: 'ALEX_TEST', remark: '' }) })).status).toBe(200);
    });

    it('returns a cursor so subscriptions beyond the first page are accessible', async () => {
        const { app, kv } = await setup();
        for (let i = 0; i < 24; i++) await kv.put(`SUB${String(i).padStart(2, '0')}`, original);
        const cookie = `sublink_session=${await createSession('tester', secret, Date.now() + 60000)}`;
        const first = await (await app.request('https://example.test/manage-subscriptions', { headers: { Cookie: cookie } })).json();
        expect(first.entries).toHaveLength(20);
        expect(first.cursor).toBeTruthy();
        const second = await (await app.request(`https://example.test/manage-subscriptions?cursor=${encodeURIComponent(first.cursor)}`, { headers: { Cookie: cookie } })).json();
        expect(second.entries).toHaveLength(5);
        expect(second.cursor).toBeNull();
    });

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
