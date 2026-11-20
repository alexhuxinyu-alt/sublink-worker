const SERVER_ID = /^[a-zA-Z0-9_-]{1,80}$/;
const MAX_SERVERS = 32;

export function isSourceEmail(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 200 &&
        value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
}

export function isSourceServerId(value) {
    return typeof value === 'string' && SERVER_ID.test(value);
}

export function isSourceLookup(value) {
    return value && isSourceEmail(value.email) && Array.isArray(value.servers) &&
        value.servers.length > 0 && value.servers.length <= MAX_SERVERS &&
        value.servers.every(isSourceServerId) && new Set(value.servers).size === value.servers.length;
}

export function createSourceBridge(config) {
    const token = config.sourceBridgeToken;
    if (typeof token !== 'string' || !/^[a-zA-Z0-9_-]{32,128}$/.test(token)) return null;
    let origin;
    try {
        origin = new URL(config.sourceBridgeOrigin);
    } catch {
        return null;
    }
    if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search ||
        origin.hash || origin.username || origin.password) return null;

    const base = new URL('/api/integrations/sublink/', origin);
    async function request(path, body) {
        const response = await fetch(new URL(path, base), {
            method: body ? 'POST' : 'GET',
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body && { 'Content-Type': 'application/json' }) },
            ...(body && { body: JSON.stringify(body) }),
            redirect: 'error',
            signal: AbortSignal.timeout(12000)
        });
        if (!response.ok || !/^application\/json\b/i.test(response.headers.get('Content-Type') ?? '')) {
            throw new Error('Invalid source bridge response');
        }
        return response.json();
    }

    return {
        async catalog() {
            const data = await request('catalog');
            if (!Array.isArray(data.users)) throw new Error('Invalid source catalog');
            return {
                users: data.users.filter(user => isSourceEmail(user?.email) && Array.isArray(user.servers))
                    .map(({ email, servers }) => ({ email, servers: publicServers(servers) }))
                    .filter(user => user.servers.length > 0),
                unavailable: publicServers(data.unavailable)
            };
        },
        async sources({ email, servers }) {
            const data = await request('sources', { email, servers });
            if (!Array.isArray(data.sources)) throw new Error('Invalid subscription sources');
            return {
                sources: data.sources.filter(source => source && servers.includes(source.serverId) && isSubscriptionUrl(source.url))
                    .map(({ serverId, url }) => ({ serverId, url })),
                unavailable: publicServers(data.unavailable)
            };
        }
    };
}

function publicServers(servers) {
    if (!Array.isArray(servers)) return [];
    return servers.filter(server => isSourceServerId(server?.id) && typeof server.name === 'string' && server.name.length <= 100)
        .map(({ id, name }) => ({ id, name }));
}

function isSubscriptionUrl(value) {
    if (typeof value !== 'string' || value.length > 2000 || value !== value.trim() || /\s/.test(value)) return false;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password && !url.hash;
    } catch {
        return false;
    }
}
