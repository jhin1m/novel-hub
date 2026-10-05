import { type CdnPurger, type Db, contentChangeSchema, urlsFor } from '@novel-hub/core';
import { UnrecoverableError } from 'bullmq';

export interface PurgeUrlsDeps {
  db: Db;
  cdn: CdnPurger;
  /** Origin of the public pages, the host the CDN caches them under. */
  appUrl: string;
}

/**
 * Purges the cached pages a content change touched. URLs come from the current database state, so
 * a late or repeated run is harmless. A malformed payload never becomes valid: not retried.
 */
export async function processPurgeUrls(data: unknown, deps: PurgeUrlsDeps): Promise<void> {
  const parsed = contentChangeSchema.safeParse(data);
  if (!parsed.success) throw new UnrecoverableError('malformed purge-urls payload');
  const urls = await urlsFor(deps.db, parsed.data, deps.appUrl);
  await deps.cdn.purge(urls);
}
