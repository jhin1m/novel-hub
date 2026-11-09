import type { Db } from '@novel-hub/db';
import { canViewMatureContent } from '../policies/mature-content';
import { getPreferences } from '../users/preferences';

/**
 * Whether `viewerId` may see and post comments under a chapter whose story is `isMature`. The one
 * check every comment read and write goes through; preferences are only read for an 18+ story.
 * The story's own author (`authorId`) always has access, whatever their preference: they must be
 * able to answer readers under their own work. Callers outside comments omit it.
 */
export async function matureCommentAccess(
  db: Db,
  viewerId: string | null,
  isMature: boolean,
  authorId?: string,
): Promise<boolean> {
  if (!isMature) return true;
  if (!viewerId) return false;
  if (viewerId === authorId) return true;
  return canViewMatureContent(await getPreferences(db, viewerId));
}
