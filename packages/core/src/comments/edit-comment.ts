import { type Db, comments, reports } from '@novel-hub/db';
import { type SQL, and, eq, sql } from 'drizzle-orm';
import { type Result, err, ok } from '../lib/result';
import { canPostCommunityContent } from '../policies/community';
import type { CurrentUser } from '../users/current-user';
import type { CommentDto } from './comment-dto';
import { findCommentTarget } from './comment-target';
import { matureCommentAccess } from './mature-comment-access';

export type EditCommentError =
  'NOT_FOUND' | 'FORBIDDEN' | 'USER_MUTED' | 'MATURE_CONTENT_DISABLED' | 'COMMENT_UNDER_REVIEW';

/** A report on the comment still waits in the moderation queue. */
const openReportOnComment: SQL = sql`exists (select 1 from ${reports} where ${reports.targetType} = 'comment' and ${reports.targetId} = ${comments.id} and ${reports.status} = 'open')`;

async function hasOpenReport(db: Db, commentId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: comments.id })
    .from(comments)
    .where(and(eq(comments.id, commentId), openReportOnComment));
  return row !== undefined;
}

/**
 * The writer replaces the text of their own shown comment (`body` already normalised by
 * `commentEditSchema`) and it is marked edited; no time limit, no history kept. The same rules as
 * posting apply again (an account allowed to post, a readable chapter or story, 18+ turned on for
 * an 18+ story). Refused with `COMMENT_UNDER_REVIEW` while a report on it is open: the moderator
 * judges the text that was reported. Editing drops a pin, so a pinned comment cannot be turned into
 * something the story's author never chose to put on top.
 */
export async function editComment(
  db: Db,
  actor: CurrentUser,
  commentId: string,
  body: string,
): Promise<Result<CommentDto, EditCommentError>> {
  const target = await findCommentTarget(db, commentId);
  if (!target || !target.shown || !target.readable) return err('NOT_FOUND');
  if (target.userId !== actor.id) return err('FORBIDDEN');
  if (!canPostCommunityContent(actor)) {
    return err(actor.status === 'muted' ? 'USER_MUTED' : 'FORBIDDEN');
  }
  if (!(await matureCommentAccess(db, actor.id, target.isMature, target.storyAuthorId))) {
    return err('MATURE_CONTENT_DISABLED');
  }
  if (await hasOpenReport(db, commentId)) return err('COMMENT_UNDER_REVIEW');

  const [row] = await db
    .update(comments)
    .set({ body, editedAt: sql`now()`, pinnedAt: null })
    .where(
      and(
        eq(comments.id, commentId),
        eq(comments.userId, actor.id),
        eq(comments.status, 'visible'),
        // Checked again in the update: a report filed since the check above still blocks it.
        sql`not ${openReportOnComment}`,
      ),
    )
    .returning({ createdAt: comments.createdAt, editedAt: comments.editedAt });
  if (!row) return err((await hasOpenReport(db, commentId)) ? 'COMMENT_UNDER_REVIEW' : 'NOT_FOUND');
  return ok({
    id: commentId,
    body,
    createdAt: row.createdAt.toISOString(),
    author: { username: actor.username, displayName: actor.displayName },
    isOwn: true,
    pinnedAt: null,
    editedAt: row.editedAt?.toISOString() ?? null,
  });
}
