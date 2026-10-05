/** Cloudflare purges at most this many URLs per request (Free plan). */
export const PURGE_CHUNK_SIZE = 100;
const PURGE_TIMEOUT_MS = 10_000;
const API_BASE = 'https://api.cloudflare.com/client/v4';

export interface CdnPurger {
  /** Drops the CDN copies of `urls` (absolute). Throws when Cloudflare refuses, so the job retries. */
  purge(urls: readonly string[]): Promise<void>;
}

export interface CdnConfig {
  zoneId: string;
  apiToken: string;
}

/** `null` when `CF_*` is not configured: purging does nothing (dev and tests have no CDN). */
export function cdnConfigFromEnv(
  env: { CF_ZONE_ID: string; CF_API_TOKEN: string } | null,
): CdnConfig | null {
  return env ? { zoneId: env.CF_ZONE_ID, apiToken: env.CF_API_TOKEN } : null;
}

/**
 * Purges by URL through the Cloudflare API, 100 URLs per request, each request bounded by a 10 s
 * timeout. Without a config it is a no-op that says so once. Neither the token nor the URLs are
 * ever logged.
 */
export function createCdnPurger(
  config: CdnConfig | null,
  fetchFn: typeof fetch = fetch,
): CdnPurger {
  if (!config) {
    let told = false;
    return {
      purge() {
        if (!told) {
          told = true;
          console.info('[cdn] purge disabled (CF_* not set); nothing is purged');
        }
        return Promise.resolve();
      },
    };
  }
  const endpoint = `${API_BASE}/zones/${config.zoneId}/purge_cache`;
  return {
    async purge(urls) {
      for (let i = 0; i < urls.length; i += PURGE_CHUNK_SIZE) {
        const files = urls.slice(i, i + PURGE_CHUNK_SIZE);
        const res = await fetchFn(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ files }),
          signal: AbortSignal.timeout(PURGE_TIMEOUT_MS),
        });
        const body = (await res.json().catch(() => null)) as { success?: unknown } | null;
        if (!res.ok || body?.success !== true) {
          throw new Error(`Cloudflare purge failed with HTTP ${res.status}`);
        }
      }
    },
  };
}
