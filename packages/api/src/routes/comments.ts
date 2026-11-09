import {
  countParagraphComments,
  createComment,
  createDiscussionComment,
  deleteComment,
  editComment,
  listChapterComments,
  listCommentReplies,
  listStoryDiscussion,
  setCommentPinned,
} from '@novel-hub/core';
import {
  commentCreateSchema,
  commentEditSchema,
  commentIdParamSchema,
  commentListQuerySchema,
  commentPinSchema,
  commentRepliesQuerySchema,
  discussionCreateSchema,
  discussionListQuerySchema,
  paragraphCountsQuerySchema,
} from '@novel-hub/shared';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { ApiDeps } from '../deps';
import { coreError } from '../lib/core-errors';
import { errorBody } from '../lib/errors';
import { validate } from '../lib/validate';
import { rateLimit } from '../middleware/rate-limit';
import { requireAuth, requireVerifiedEmail } from '../middleware/require-auth';
import { sessionMiddleware } from '../middleware/session';

/** A 2,000-character comment in JSON with room for escapes. */
const BODY_LIMIT_BYTES = 32 * 1024;

/**
 * Chapter comments and the story discussion (comments tied to no chapter). Reading is public
 * (guests too) but never cached, since `isOwn` and `viewerCanPin` follow the session; pages load
 * them in the browser so their HTML stays the same for everyone. Posting and editing need a
 * verified email and an active account; editing and deleting are the writer's own, pinning the
 * story author's. Under an 18+ story, reading and posting are only for an account that turned 18+
 * on (403 otherwise).
 */
export function createCommentRoutes(deps: Pick<ApiDeps, 'auth' | 'db' | 'rateLimit' | 'clientIp'>) {
  // Only on routes with a body: on a bodiless DELETE the limiter rebuilds the request, which
  // fails under the dev server.
  const limitBody = bodyLimit({
    maxSize: BODY_LIMIT_BYTES,
    onError: (c) => c.json(errorBody('PAYLOAD_TOO_LARGE', 'Request body is too large'), 413),
  });

  return (
    new Hono()
      .use(sessionMiddleware(deps.auth))
      .get('/', validate('query', commentListQuerySchema), async (c) => {
        const { story, chapter, paragraph, cursor } = c.req.valid('query');
        const result = await listChapterComments(deps.db, c.var.user, {
          publicId: story,
          number: chapter,
          paragraphId: paragraph,
          cursor,
        });
        if (!result.ok) return coreError(c, result.error);
        return c.json(result.value, 200);
      })
      // Loaded with the comments at the end of the chapter, never with the page itself.
      .get('/paragraph-counts', validate('query', paragraphCountsQuerySchema), async (c) => {
        const { story, chapter } = c.req.valid('query');
        const result = await countParagraphComments(deps.db, c.var.user, {
          publicId: story,
          number: chapter,
        });
        if (!result.ok) return coreError(c, result.error);
        return c.json({ counts: result.value }, 200);
      })
      .get('/discussion', validate('query', discussionListQuerySchema), async (c) => {
        const { story, cursor } = c.req.valid('query');
        const result = await listStoryDiscussion(deps.db, c.var.user, { publicId: story, cursor });
        if (!result.ok) return coreError(c, result.error);
        return c.json(result.value, 200);
      })
      .post(
        '/discussion',
        limitBody,
        requireVerifiedEmail,
        rateLimit(deps, 'comment'),
        validate('json', discussionCreateSchema),
        async (c) => {
          const result = await createDiscussionComment(
            deps.db,
            c.var.authUser,
            c.req.valid('json'),
          );
          if (!result.ok) return coreError(c, result.error);
          return c.json({ comment: result.value }, 201);
        },
      )
      .post(
        '/',
        limitBody,
        requireVerifiedEmail,
        rateLimit(deps, 'comment'),
        validate('json', commentCreateSchema),
        async (c) => {
          const result = await createComment(deps.db, c.var.authUser, c.req.valid('json'));
          if (!result.ok) return coreError(c, result.error);
          return c.json({ comment: result.value }, 201);
        },
      )
      .get(
        '/:id/replies',
        validate('param', commentIdParamSchema),
        validate('query', commentRepliesQuerySchema),
        async (c) => {
          const result = await listCommentReplies(deps.db, c.var.user, {
            commentId: c.req.valid('param').id,
            cursor: c.req.valid('query').cursor,
          });
          if (!result.ok) return coreError(c, result.error);
          return c.json(result.value, 200);
        },
      )
      .patch(
        '/:id',
        limitBody,
        requireVerifiedEmail,
        rateLimit(deps, 'comment'),
        validate('param', commentIdParamSchema),
        validate('json', commentEditSchema),
        async (c) => {
          const result = await editComment(
            deps.db,
            c.var.authUser,
            c.req.valid('param').id,
            c.req.valid('json').body,
          );
          if (!result.ok) return coreError(c, result.error);
          return c.json({ comment: result.value }, 200);
        },
      )
      .put(
        '/:id/pin',
        limitBody,
        requireAuth,
        validate('param', commentIdParamSchema),
        validate('json', commentPinSchema),
        async (c) => {
          const result = await setCommentPinned(
            deps.db,
            c.var.authUser,
            c.req.valid('param').id,
            c.req.valid('json').pinned,
          );
          if (!result.ok) return coreError(c, result.error);
          return c.json(result.value, 200);
        },
      )
      .delete('/:id', requireAuth, validate('param', commentIdParamSchema), async (c) => {
        const result = await deleteComment(deps.db, c.var.authUser, c.req.valid('param').id);
        if (!result.ok) return coreError(c, result.error);
        return c.body(null, 204);
      })
  );
}
