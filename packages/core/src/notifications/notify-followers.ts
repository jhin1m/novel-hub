import { type Db, chapters, stories, users } from '@novel-hub/db';
import { NOTIFICATION_CHAPTER_IDS_MAX } from '@novel-hub/shared';
import { eq, sql } from 'drizzle-orm';
import { canReadChapter } from '../access/can-read-chapter';

/**
 * Tells the followers of a newly published chapter's story and of its author, in one statement.
 * Each reader keeps at most one unread notification per story (`dedupe_key = story:{id}`): a later
 * chapter appends its id (the last `NOTIFICATION_CHAPTER_IDS_MAX` are kept), bumps `count` and
 * moves the notification to the top. Running again for the same chapter changes nothing, as the
 * outbox delivers at least once. The author and banned followers get nothing, and nothing is sent
 * when the chapter can no longer be read by the time the job runs.
 */
export async function notifyFollowersOfChapter(
  db: Db,
  chapterId: string,
): Promise<{ affected: number }> {
  const [row] = await db
    .select({
      storyId: stories.id,
      authorId: stories.authorId,
      status: chapters.status,
      deletedAt: chapters.deletedAt,
      visibility: stories.visibility,
      authorStatus: users.status,
    })
    .from(chapters)
    .innerJoin(stories, eq(stories.id, chapters.storyId))
    .innerJoin(users, eq(users.id, stories.authorId))
    .where(eq(chapters.id, chapterId))
    .limit(1);
  if (!row) return { affected: 0 };
  const decision = canReadChapter(null, {
    status: row.status,
    deletedAt: row.deletedAt,
    story: { visibility: row.visibility, authorStatus: row.authorStatus },
  });
  if (!decision.readable) return { affected: 0 };

  const { storyId, authorId } = row;
  const chapter = sql`to_jsonb(${chapterId}::text)`;
  const dedupeKey = `story:${storyId}`;
  // Recipients in `user_id` order, so two fan-outs for the same story lock rows in the same order
  // and never deadlock. A reader who already read a notification naming this chapter is skipped,
  // so a late redelivery does not announce it twice. The conflict target's predicate must match
  // the partial unique index exactly.
  const result = await db.execute(sql`
    insert into notifications (user_id, type, payload, dedupe_key)
    select r.user_id, 'chapter_published',
      jsonb_build_object('storyId', ${storyId}::text, 'chapterIds', jsonb_build_array(${chapter}), 'count', 1),
      ${dedupeKey}
    from (
      select distinct f.user_id
      from follows f
      join users u on u.id = f.user_id and u.status <> 'banned'
      where ((f.target_type = 'story' and f.target_id = ${storyId}::uuid)
          or (f.target_type = 'user' and f.target_id = ${authorId}::uuid))
        and f.user_id <> ${authorId}::uuid
        and not exists (
          select 1 from notifications seen
          where seen.user_id = f.user_id
            and seen.dedupe_key = ${dedupeKey}
            and seen.read_at is not null
            and seen.payload->'chapterIds' @> jsonb_build_array(${chapter})
        )
    ) r
    order by r.user_id
    on conflict (user_id, dedupe_key) where read_at is null
    do update set
      payload = jsonb_build_object(
        'storyId', ${storyId}::text,
        'chapterIds', (
          select jsonb_agg(e order by ord)
          from jsonb_array_elements((notifications.payload->'chapterIds') || jsonb_build_array(${chapter}))
            with ordinality as ids(e, ord)
          where ord > jsonb_array_length(notifications.payload->'chapterIds') + 1 - ${NOTIFICATION_CHAPTER_IDS_MAX}
        ),
        'count', coalesce((notifications.payload->>'count')::int, 0) + 1
      ),
      created_at = now()
    where not (notifications.payload->'chapterIds' @> jsonb_build_array(${chapter}))
  `);
  return { affected: result.rowCount ?? 0 };
}
