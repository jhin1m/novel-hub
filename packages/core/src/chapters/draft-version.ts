import { chapterDrafts } from '@novel-hub/db';
import { sql } from 'drizzle-orm';

/**
 * `chapter_drafts.updated_at` cut to milliseconds. Postgres keeps microseconds (rows inserted with
 * `defaultNow()` have them) while JS dates stop at milliseconds, so every read and every compare
 * of a draft version goes through this expression; otherwise a version read back from the API
 * would never match the stored one.
 */
export const draftVersion =
  sql<Date>`date_trunc('milliseconds', ${chapterDrafts.updatedAt})`.mapWith(
    chapterDrafts.updatedAt,
  );

/**
 * Timestamp for a new draft version. Always after `base`, so two saves within the same
 * millisecond still produce different versions.
 */
export function nextDraftVersion(base: Date | null, now: Date = new Date()): Date {
  if (base && now.getTime() <= base.getTime()) return new Date(base.getTime() + 1);
  return now;
}
