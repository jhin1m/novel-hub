/**
 * Site-wide env every page head and `robots.txt` read: `APP_URL` and `ALLOW_INDEXING` only, not
 * the whole server setup, so pages that need no database (terms, sign-in) and `robots.txt` keep
 * answering while Postgres or Redis is down. Parsed once: it never changes at runtime.
 */
import { appEnvSchema, loadServerEnv, seoEnvSchema } from '@novel-hub/shared/env';
import type { SiteConfig } from '../lib/seo';

let config: SiteConfig | undefined;

export function getSiteEnv(): SiteConfig {
  if (!config) {
    const env = loadServerEnv(appEnvSchema.extend(seoEnvSchema.shape));
    config = { appUrl: env.APP_URL, allowIndexing: env.ALLOW_INDEXING };
  }
  return config;
}
