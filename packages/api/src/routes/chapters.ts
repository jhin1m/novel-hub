import {
  type PublishResult,
  createChapter,
  deleteChapter,
  getDraft,
  publishChapter,
  saveDraft,
  scheduleChapter,
  unscheduleChapter,
  updateChapterMeta,
} from '@novel-hub/core';
import {
  LIMITS,
  chapterMetaSchema,
  chapterNumberParamSchema,
  draftSaveSchema,
  publishChapterSchema,
  scheduleChapterSchema,
} from '@novel-hub/shared';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import type { ApiDeps } from '../deps';
import { coreError } from '../lib/core-errors';
import { errorBody } from '../lib/errors';
import { validate } from '../lib/validate';
import { requireVerifiedEmail } from '../middleware/require-auth';

const storyParamSchema = z.object({ publicId: z.string() });

/** Response of publish and schedule: the editor continues from `draft.updatedAt`. */
function publishBody(result: PublishResult) {
  return {
    chapter: result.chapter,
    draft: { updatedAt: result.draftUpdatedAt, doc: result.normalizedDoc },
    unchanged: result.unchanged,
    storyVisibility: result.storyVisibility,
  };
}

/**
 * Chapters of a story, mounted under `/stories/:publicId/chapters` inside the story routes, whose
 * session middleware already ran (running it again would look the session up twice). Every route
 * needs a verified email; ownership and soft deletion are checked in `core`.
 */
export function createChapterRoutes(deps: Pick<ApiDeps, 'db'>) {
  return (
    new Hono()
      .post('/', requireVerifiedEmail, validate('param', storyParamSchema), async (c) => {
        const result = await createChapter(deps.db, c.var.authUser, c.req.valid('param').publicId);
        if (!result.ok) return coreError(c, result.error);
        return c.json({ chapter: result.value }, 201);
      })
      .patch(
        '/:number',
        requireVerifiedEmail,
        validate('param', chapterNumberParamSchema),
        validate('json', chapterMetaSchema),
        async (c) => {
          const { publicId, number } = c.req.valid('param');
          const result = await updateChapterMeta(
            deps.db,
            c.var.authUser,
            publicId,
            number,
            c.req.valid('json'),
          );
          if (!result.ok) return coreError(c, result.error);
          return c.json({ chapter: result.value }, 200);
        },
      )
      .get(
        '/:number/draft',
        requireVerifiedEmail,
        validate('param', chapterNumberParamSchema),
        async (c) => {
          const { publicId, number } = c.req.valid('param');
          const result = await getDraft(deps.db, c.var.authUser, publicId, number);
          if (!result.ok) return coreError(c, result.error);
          return c.json(result.value, 200);
        },
      )
      .put(
        '/:number/draft',
        requireVerifiedEmail,
        bodyLimit({
          maxSize: LIMITS.draftMaxBytes,
          onError: (c) => c.json(errorBody('DRAFT_TOO_LARGE', 'Draft is larger than 2 MB'), 413),
        }),
        validate('param', chapterNumberParamSchema),
        validate('json', draftSaveSchema),
        async (c) => {
          const { publicId, number } = c.req.valid('param');
          const result = await saveDraft(
            deps.db,
            c.var.authUser,
            publicId,
            number,
            c.req.valid('json'),
          );
          if (!result.ok) return coreError(c, result.error);
          return c.json(result.value, 200);
        },
      )
      .delete(
        '/:number',
        requireVerifiedEmail,
        validate('param', chapterNumberParamSchema),
        async (c) => {
          const { publicId, number } = c.req.valid('param');
          const result = await deleteChapter(deps.db, c.var.authUser, publicId, number);
          if (!result.ok) return coreError(c, result.error);
          return c.body(null, 204);
        },
      )
      // Publishing renders the stored draft on the server; the body only pins its version.
      .post(
        '/:number/publish',
        requireVerifiedEmail,
        validate('param', chapterNumberParamSchema),
        validate('json', publishChapterSchema),
        async (c) => {
          const { publicId, number } = c.req.valid('param');
          const result = await publishChapter(
            deps.db,
            c.var.authUser,
            publicId,
            number,
            c.req.valid('json'),
          );
          if (!result.ok) return coreError(c, result.error);
          return c.json(publishBody(result.value), 200);
        },
      )
      .put(
        '/:number/schedule',
        requireVerifiedEmail,
        validate('param', chapterNumberParamSchema),
        validate('json', scheduleChapterSchema),
        async (c) => {
          const { publicId, number } = c.req.valid('param');
          const { baseUpdatedAt, scheduledAt } = c.req.valid('json');
          const result = await scheduleChapter(deps.db, c.var.authUser, publicId, number, {
            baseUpdatedAt,
            scheduledAt: new Date(scheduledAt),
          });
          if (!result.ok) return coreError(c, result.error);
          return c.json(publishBody(result.value), 200);
        },
      )
      .delete(
        '/:number/schedule',
        requireVerifiedEmail,
        validate('param', chapterNumberParamSchema),
        async (c) => {
          const { publicId, number } = c.req.valid('param');
          const result = await unscheduleChapter(deps.db, c.var.authUser, publicId, number);
          if (!result.ok) return coreError(c, result.error);
          return c.json({ chapter: result.value }, 200);
        },
      )
  );
}
