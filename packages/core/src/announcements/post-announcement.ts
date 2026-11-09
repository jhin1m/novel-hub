import { type Db, storyAnnouncements } from '@novel-hub/db';
import { ANNOUNCEMENT_RULES, STATS_TIMEZONE, statsDate } from '@novel-hub/shared';
import { and, count, eq, sql } from 'drizzle-orm';
import { recordContentChanges } from '../content/outbox';
import { type Result, err, ok } from '../lib/result';
import { canPostCommunityContent } from '../policies/community';
import type { StoryActor } from '../policies/story';
import { findRateableStory } from '../ratings/rating-dto';
import { type AnnouncementDto, findOwnStory, toAnnouncementDto } from './announcement-dto';

export type PostAnnouncementError =
  'NOT_FOUND' | 'FORBIDDEN' | 'USER_MUTED' | 'INVALID_STATE' | 'ANNOUNCEMENT_DAILY_LIMIT';

/**
 * The author posts an announcement to the followers of their story. `body` is already normalised
 * by `announcementCreateSchema`. Only a public story with a published chapter takes one (followers
 * only exist there): a draft or hidden story is `INVALID_STATE`. A story posts at most
 * `perStoryPerDay` per Vietnamese calendar day, deleted ones included so deleting and posting
 * again does not get around it; a per-story advisory lock makes the count and the insert atomic
 * against parallel requests. The followers are told by the worker, through the outbox.
 */
export async function postAnnouncement(
  db: Db,
  actor: StoryActor,
  publicId: string,
  body: string,
  now: Date = new Date(),
): Promise<Result<AnnouncementDto, PostAnnouncementError>> {
  const own = await findOwnStory(db, actor, publicId);
  if (!own.ok) return err(own.error);
  if (!canPostCommunityContent(actor)) {
    // An unverified email is refused by the route already; this is the second layer.
    return err(actor.status === 'muted' ? 'USER_MUTED' : 'FORBIDDEN');
  }
  if (!(await findRateableStory(db, publicId))) return err('INVALID_STATE');
  const storyId = own.storyId;

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`announce:${storyId}`}, 0))`,
    );
    const today = statsDate(now);
    const [counted] = await tx
      .select({ n: count() })
      .from(storyAnnouncements)
      .where(
        and(
          eq(storyAnnouncements.storyId, storyId),
          // The Vietnamese day as a `created_at` range, so the (story_id, created_at) index serves it.
          sql`${storyAnnouncements.createdAt} >= (${today}::date::timestamp at time zone ${STATS_TIMEZONE})`,
          sql`${storyAnnouncements.createdAt} < ((${today}::date + 1)::timestamp at time zone ${STATS_TIMEZONE})`,
        ),
      );
    if ((counted?.n ?? 0) >= ANNOUNCEMENT_RULES.perStoryPerDay) {
      return err('ANNOUNCEMENT_DAILY_LIMIT');
    }
    const [row] = await tx
      .insert(storyAnnouncements)
      .values({ storyId, authorId: actor.id, body, createdAt: now })
      .returning({
        id: storyAnnouncements.id,
        body: storyAnnouncements.body,
        createdAt: storyAnnouncements.createdAt,
      });
    if (!row) throw new Error('announcement insert returned no row');
    await recordContentChanges(tx, [
      { entity: 'announcement', action: 'posted', announcementId: row.id, storyId },
    ]);
    return ok(toAnnouncementDto(row));
  });
}
