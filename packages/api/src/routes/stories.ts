import {
  createStory,
  deleteAnnouncement,
  getPreferences,
  listManagedAnnouncements,
  listRelatedStories,
  listStories,
  postAnnouncement,
  readRanking,
  removeStoryCover,
  setStoryCover,
  updateStory,
} from '@novel-hub/core';
import {
  LIMITS,
  announcementCreateSchema,
  announcementIdParamSchema,
  publicIdParamSchema,
  storyCreateSchema,
  storyListQuery,
  storyUpdateSchema,
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
import { createChapterRoutes } from './chapters';

/** Multipart overhead on top of the 5 MB file; the exact file size is checked afterwards. */
const COVER_BODY_LIMIT = Math.round(LIMITS.cover.maxBytes * 1.1);

/** A 1,000-character announcement in JSON stays far below this, even fully escaped. */
const ANNOUNCEMENT_BODY_LIMIT = 8 * 1024;

/**
 * Public story lists (any visitor) and writing stories (verified email; ownership is checked in
 * `core`).
 */
export function createStoryRoutes(
  deps: Pick<ApiDeps, 'auth' | 'db' | 'storage' | 'rankings' | 'rateLimit' | 'clientIp'>,
) {
  return (
    new Hono()
      // "Related stories" under a story page. The same for everyone, so it is registered before the
      // session middleware and never reads the session or carries a renewed cookie. `no-store`
      // like the rest of `/api`: a public cache header here only made Chrome hold back a second
      // identical request behind the first (cache lock), and Cloudflare does not cache `/api/*`.
      .get('/:publicId/related', validate('param', publicIdParamSchema), async (c) => {
        const related = await listRelatedStories(deps.db, c.req.valid('param').publicId);
        if (!related) return coreError(c, 'NOT_FOUND');
        return c.json(related, 200);
      })
      .use(sessionMiddleware(deps.auth))
      // The public lists as the signed-in reader may see them: 18+ stories only when their own
      // preferences allow it, never because the request asks. Uncached (`no-store`).
      .get('/', validate('query', storyListQuery), async (c) => {
        const { user } = c.var;
        const includeMature = user ? (await getPreferences(deps.db, user.id)).showMature : false;
        const query = c.req.valid('query');
        if (query.list === 'ranking') {
          const ranking = await readRanking(deps.db, deps.rankings, query.period, {
            includeMature,
          });
          // An outage is not an empty ranking: the client keeps the server-rendered list.
          if (!ranking.available) {
            return c.json(
              errorBody('RANKINGS_UNAVAILABLE', 'Rankings are temporarily unavailable'),
              503,
            );
          }
          return c.json({ stories: ranking.stories, page: 1, totalPages: 1 }, 200);
        }
        const list = await listStories(deps.db, query, { includeMature });
        if (!list) return coreError(c, 'NOT_FOUND');
        return c.json(list, 200);
      })
      .post(
        '/',
        requireVerifiedEmail,
        rateLimit(deps, 'createStory'),
        validate('json', storyCreateSchema),
        async (c) => {
          const result = await createStory(deps.db, c.var.authUser, c.req.valid('json'));
          if (!result.ok) return coreError(c, result.error);
          return c.json({ story: result.value }, 201);
        },
      )
      .patch('/:publicId', requireVerifiedEmail, validate('json', storyUpdateSchema), async (c) => {
        const result = await updateStory(
          deps.db,
          c.var.authUser,
          c.req.param('publicId'),
          c.req.valid('json'),
        );
        if (!result.ok) return coreError(c, result.error);
        return c.json({ story: result.value.story }, 200);
      })
      .put(
        '/:publicId/cover',
        requireVerifiedEmail,
        // Before the body limit: a refused upload is not read at all.
        rateLimit(deps, 'uploadCover'),
        bodyLimit({
          maxSize: COVER_BODY_LIMIT,
          onError: (c) => c.json(errorBody('FILE_TOO_LARGE', 'File is larger than 5 MB'), 413),
        }),
        async (c) => {
          const { storage } = deps;
          if (!storage) {
            return c.json(errorBody('STORAGE_UNAVAILABLE', 'Image storage is not configured'), 503);
          }
          let file: unknown;
          try {
            file = (await c.req.parseBody()).file;
          } catch {
            file = undefined;
          }
          if (!(file instanceof File)) {
            return c.json(errorBody('VALIDATION_ERROR', 'Expected a multipart field "file"'), 400);
          }
          if (file.size > LIMITS.cover.maxBytes) return coreError(c, 'FILE_TOO_LARGE');
          const result = await setStoryCover(
            { db: deps.db, storage },
            c.var.authUser,
            c.req.param('publicId'),
            new Uint8Array(await file.arrayBuffer()),
          );
          if (!result.ok) return coreError(c, result.error);
          return c.json({ story: result.value }, 200);
        },
      )
      .delete('/:publicId/cover', requireVerifiedEmail, async (c) => {
        const result = await removeStoryCover(
          { db: deps.db },
          c.var.authUser,
          c.req.param('publicId'),
        );
        if (!result.ok) return coreError(c, result.error);
        return c.json({ story: result.value }, 200);
      })
      // Announcements to the story's followers: the author lists, posts and deletes them here;
      // readers see them on the server-rendered story and author pages.
      .get(
        '/:publicId/announcements',
        requireAuth,
        validate('param', publicIdParamSchema),
        async (c) => {
          const result = await listManagedAnnouncements(
            deps.db,
            c.var.authUser,
            c.req.valid('param').publicId,
          );
          if (!result.ok) return coreError(c, result.error);
          return c.json({ announcements: result.value }, 200);
        },
      )
      .post(
        '/:publicId/announcements',
        bodyLimit({
          maxSize: ANNOUNCEMENT_BODY_LIMIT,
          onError: (c) => c.json(errorBody('PAYLOAD_TOO_LARGE', 'Request body is too large'), 413),
        }),
        requireVerifiedEmail,
        rateLimit(deps, 'announce'),
        validate('param', publicIdParamSchema),
        validate('json', announcementCreateSchema),
        async (c) => {
          const result = await postAnnouncement(
            deps.db,
            c.var.authUser,
            c.req.valid('param').publicId,
            c.req.valid('json').body,
          );
          if (!result.ok) return coreError(c, result.error);
          return c.json({ announcement: result.value }, 201);
        },
      )
      .delete(
        '/:publicId/announcements/:id',
        requireAuth,
        validate('param', announcementIdParamSchema),
        async (c) => {
          const { publicId, id } = c.req.valid('param');
          const result = await deleteAnnouncement(deps.db, c.var.authUser, publicId, id);
          if (!result.ok) return coreError(c, result.error);
          return c.body(null, 204);
        },
      )
      .route('/:publicId/chapters', createChapterRoutes(deps))
  );
}
