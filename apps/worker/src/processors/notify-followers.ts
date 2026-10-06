import { type Db, notifyFollowersOfChapter } from '@novel-hub/core';
import { notifyFollowersPayload } from '@novel-hub/shared';
import { UnrecoverableError } from 'bullmq';

export interface NotifyFollowersDeps {
  db: Db;
}

/**
 * Creates or bumps the "new chapter" notifications of one chapter's followers from the current
 * database state; idempotent per chapter, so a repeated run is harmless. A malformed payload is
 * never retried.
 */
export async function processNotifyFollowers(
  data: unknown,
  deps: NotifyFollowersDeps,
): Promise<void> {
  const parsed = notifyFollowersPayload.safeParse(data);
  if (!parsed.success) throw new UnrecoverableError('malformed notify-followers payload');
  await notifyFollowersOfChapter(deps.db, parsed.data.chapterId);
}
