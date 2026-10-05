/** Site-wide values every page head needs, loaded once by the root route. */
import { createServerFn } from '@tanstack/react-start';
import type { SiteConfig } from '../lib/seo';
import { getSiteEnv } from '../server/site-env';

export const getSiteConfig = createServerFn({ method: 'GET' }).handler((): SiteConfig =>
  getSiteEnv(),
);
