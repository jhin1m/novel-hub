import type { Db } from '@novel-hub/db';
import { TOP_READERS } from '@novel-hub/shared';
import { sql } from 'drizzle-orm';
import { matureCommentAccess } from '../comments/mature-comment-access';
import { type Result, err, ok } from '../lib/result';
import { findRateableStory } from '../ratings/rating-dto';

/** One of a story's most engaged readers. Only the rank is public, never the score. */
export interface TopReaderDto {
  rank: number;
  username: string;
  displayName: string;
}

/**
 * The `TOP_READERS.limit` most engaged readers of a story. Only readers who already left a public
 * trace on it (a visible comment or rating, or a nomination) are candidates: reading progress is
 * private, so someone who only reads is never listed. Score = chapter reached (capped) + chapters
 * commented on + rating + nominations, weighted by `TOP_READERS.weights`. The author and accounts
 * that are not `active` are left out. An 18+ story never lists who reads it: the viewer gets
 * `MATURE_CONTENT_DISABLED` without the 18+ preference, an empty list with it.
 */
export async function getTopReaders(
  db: Db,
  viewer: { id: string } | null,
  publicId: string,
): Promise<Result<TopReaderDto[], 'NOT_FOUND' | 'MATURE_CONTENT_DISABLED'>> {
  const story = await findRateableStory(db, publicId);
  if (!story) return err('NOT_FOUND');
  if (story.isMature) {
    return (await matureCommentAccess(db, viewer?.id ?? null, true))
      ? ok([])
      : err('MATURE_CONTENT_DISABLED');
  }

  const w = TOP_READERS.weights;
  // Candidates come from this story's comments, ratings and nominations (all indexed by story), so
  // the query never walks every reader of a popular story.
  const result = await db.execute<{ username: string; display_name: string }>(sql`
    with candidates as (
      select user_id from comments where story_id = ${story.id} and status = 'visible'
      union
      select user_id from ratings where story_id = ${story.id} and status = 'visible'
      union
      select user_id from story_nominations where story_id = ${story.id}
    ),
    scored as (
      select
        u.username,
        u.display_name,
        coalesce((
          select least(ch.number, ${TOP_READERS.chapterCap})
          from reading_progress rp
          join chapters ch on ch.id = rp.chapter_id
          where rp.user_id = u.id and rp.story_id = ${story.id}
        ), 0) * ${w.chapter}
        + (
          select count(distinct c.chapter_id)
          from comments c
          where c.story_id = ${story.id} and c.user_id = u.id and c.status = 'visible'
        ) * ${w.commentedChapter}
        + (
          select count(*)
          from ratings r
          where r.story_id = ${story.id} and r.user_id = u.id and r.status = 'visible'
        ) * ${w.rating}
        + (
          select count(*)
          from story_nominations n
          where n.story_id = ${story.id} and n.user_id = u.id
        ) * ${w.nomination} as score
      from candidates k
      join users u on u.id = k.user_id
      where u.status = 'active' and u.id <> ${story.authorId}
    )
    select username, display_name
    from scored
    where score > 0
    order by score desc, username asc
    limit ${TOP_READERS.limit}`);
  return ok(
    result.rows.map((row, index) => ({
      rank: index + 1,
      username: row.username,
      displayName: row.display_name,
    })),
  );
}
