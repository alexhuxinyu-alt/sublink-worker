import { CloudflareKVAdapter } from '../adapters/kv/cloudflareKv.js';

export function createCloudflareRuntime(env) {
    return {
        kv: env?.SUBLINK_KV ? new CloudflareKVAdapter(env.SUBLINK_KV) : null,
        assetFetcher: env?.ASSETS ? (request) => env.ASSETS.fetch(request) : null,
        logger: console,
        config: { authUsername: env?.AUTH_USERNAME, authPassword: env?.AUTH_PASSWORD, authSessionSecret: env?.AUTH_SESSION_SECRET, authSessionHours: Number(env?.AUTH_SESSION_HOURS) || 24 }
    };
}
