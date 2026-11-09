import { type Db, comments, users } from '@novel-hub/db';
import type { DiscussionCreateInput } from '@novel-hub/shared';
import { type SQL, and, eq, isNull } from 'drizzle-orm';
import { type Result, err, ok } from '../lib/result';
import { canPostCommunityContent } from '../policies/community';
import { findRateableStory } from '../ratings/rating-dto';
import type { CurrentUser } from '../users/current-user';
import { type CommentDto, type CommentViewer, visibleCommentWhere } from './comment-dto';
import { type CreateCommentError, newCommentDto, threadOf } from './create-comment';
import { matureCommentAccess } from './mature-comment-access';
import { type CommentThreadsPage, loadThreadsPage } from './thread-page';

export type StoryDiscussionPage = CommentThreadsPage;

/** Shown top-level comments of the story's discussion, the writer joined as `users`. */
function discussionThreadWhere(storyId: string): SQL {
  return and(
    eq(comments.storyId, storyId),
    isNull(comments.chapterId),
    isNull(comments.parentId),
    visibleCommentWhere(users),
  ) as SQL;
}

/**
 * One page of the story's discussion (comments tied to no chapter), in the shape of a chapter's
 * list: pinned threads first and apart, the others newest first with their oldest replies. Open on
 * any story whose ratings are (`findRateableStory`); `NOT_FOUND` otherwise, and
 * `MATURE_CONTENT_DISABLED` under an 18+ story the viewer has not turned 18+ on for.
 */
export async function listStoryDiscussion(
  db: Db,
  viewer: CommentViewer,
  query: { publicId: string; cursor?: string | undefined },
): Promise<Result<StoryDiscussionPage, 'NOT_FOUND' | 'MATURE_CONTENT_DISABLED'>> {
  const story = await findRateableStory(db, query.publicId);
  if (!story) return err('NOT_FOUND');
  if (!(await matureCommentAccess(db, viewer?.id ?? null, story.isMature, story.authorId))) {
    return err('MATURE_CONTENT_DISABLED');
  }
  return ok(
    await loadThreadsPage(db, viewer, {
      threadWhere: discussionThreadWhere(story.id),
      cursor: query.cursor,
      pins: { storyAuthorId: story.authorId },
      orphaned: () => false,
    }),
  );
}

/**
 * Posts a comment, or a reply when `parentId` is set, to the story's discussion; the rules of a
 * chapter comment (an account allowed to post, 18+ turned on for an 18+ story, two-level threads).
 * A reply only joins a thread of this story's discussion.
 */
export async function createDiscussionComment(
  db: Db,
  actor: CurrentUser,
  input: DiscussionCreateInput,
): Promise<Result<CommentDto, CreateCommentError>> {
  if (!canPostCommunityContent(actor)) {
    return err(actor.status === 'muted' ? 'USER_MUTED' : 'FORBIDDEN');
  }
  const story = await findRateableStory(db, input.publicId);
  if (!story) return err('NOT_FOUND');
  if (!(await matureCommentAccess(db, actor.id, story.isMature, story.authorId))) {
    return err('MATURE_CONTENT_DISABLED');
  }
  let parentId: string | null = null;
  if (input.parentId) {
    const thread = await threadOf(db, { storyId: story.id }, input.parentId);
    if (!thread) return err('INVALID_STATE');
    parentId = thread.id;
  }
  const [row] = await db
    .insert(comments)
    .values({ chapterId: null, storyId: story.id, userId: actor.id, parentId, body: input.body })
    .returning({ id: comments.id, createdAt: comments.createdAt });
  if (!row) throw new Error('comment insert returned nothing');
  return ok(newCommentDto(actor, row, input.body));
}
