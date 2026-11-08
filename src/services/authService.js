const encoder = new TextEncoder();

export async function createSession(username, secret, expiresAt) {
    const payload = toBase64Url(JSON.stringify({ username, expiresAt }));
    return `${payload}.${await sign(payload, secret)}`;
}

export async function verifySession(token, secret) {
    if (!token || !secret) return false;
    const [payload, signature] = token.split('.');
    if (!payload || !signature || token.split('.').length !== 2) return false;
    if (!constantTimeEqual(signature, await sign(payload, secret))) return false;
    try {
        const data = JSON.parse(fromBase64Url(payload));
        return typeof data?.username === 'string' && Number.isFinite(data?.expiresAt) && data.expiresAt > Date.now();
    } catch { return false; }
}

export async function credentialsMatch(username, password, configuredUsername, configuredPassword) {
    const [providedUser, providedPassword, expectedUser, expectedPassword] = await Promise.all([
        digest(username || ''), digest(password || ''), digest(configuredUsername || ''), digest(configuredPassword || '')
    ]);
    return constantTimeEqual(providedUser, expectedUser) && constantTimeEqual(providedPassword, expectedPassword);
}

async function sign(value, secret) {
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
}
async function digest(value) { return toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))); }
function constantTimeEqual(left, right) {
    if (left.length !== right.length) return false;
    let result = 0;
    for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
    return result === 0;
}
function toBase64Url(value) {
    const bytes = typeof value === 'string' ? encoder.encode(value) : value;
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(value) {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    return new TextDecoder().decode(Uint8Array.from(atob(padded), char => char.charCodeAt(0)));
}
