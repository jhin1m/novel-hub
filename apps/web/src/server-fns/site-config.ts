/** Site-wide values every page head needs, loaded once by the root route. */
import { appEnvSchema, loadServerEnv } from '@novel-hub/shared/env';
import { createServerFn } from '@tanstack/react-start';
import type { SiteConfig } from '../lib/seo';

// Only `APP_URL` is read, not the whole server setup: pages that need no database (terms,
// sign-in) keep rendering while Postgres or Redis is down.
let appUrl: string | undefined;

export const getSiteConfig = createServerFn({ method: 'GET' }).handler((): SiteConfig => {
  appUrl ??= loadServerEnv(appEnvSchema).APP_URL;
  return { appUrl };
});
