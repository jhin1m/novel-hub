import {
  getContinueReading,
  listHistory,
  recordChapterView,
  removeFromHistory,
  saveReadingProgress,
} from '@novel-hub/core';
import {
  chapterViewInput,
  historyQuery,
  publicIdParamSchema,
  readingProgressInput,
} from '@novel-hub/shared';
import { type Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getCookie, setCookie } from 'hono/cookie';
import type { ApiDeps } from '../deps';
import { coreError } from '../lib/core-errors';
import { errorBody } from '../lib/errors';
import { validate } from '../lib/validate';
import { requireAuth } from '../middleware/require-auth';
import { sessionMiddleware } from '../middleware/session';

const BODY_LIMIT_BYTES = 4 * 1024;
/** Anonymous viewer id for the per-viewer read cap. Scoped to these routes, so the public HTML never carries it. */
const VIEWER_COOKIE = 'nh_vid';
const VIEWER_COOKIE_PATH = '/api/v1/reading';
const VIEWER_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;
const VIEWER_ID = /^[A-Za-z0-9_-]{22}$/;

/**
 * Reading activity: progress and history of signed-in readers (their own rows only) and counted
 * reads. Never cached.
 */
export function createReadingRoutes(
  deps: Pick<ApiDeps, 'auth' | 'db' | 'appUrl' | 'viewCounter' | 'clientIp'>,
) {
  const secureCookie = new URL(deps.appUrl).protocol === 'https:';

  /**
   * The per-viewer key: the account when signed in, otherwise the anonymous cookie. A new
   * anonymous id is only handed out (`setCookie`) once the read was accepted.
   */
  const viewerOf = (c: Context, userId: string | undefined) => {
    if (userId) return { viewer: `u:${userId}`, newId: null };
    const id = getCookie(c, VIEWER_COOKIE);
    if (id && VIEWER_ID.test(id)) return { viewer: `a:${id}`, newId: null };
    const fresh = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url');
    return { viewer: `a:${fresh}`, newId: fresh };
  };

  // Only on the routes that take a body (a new one must be added here): on a bodiless request
  // without `content-length` (a browser DELETE), the limiter rebuilds the request and that fails
  // under the dev server.
  const limitBody = bodyLimit({
    maxSize: BODY_LIMIT_BYTES,
    onError: (c) => c.json(errorBody('PAYLOAD_TOO_LARGE', 'Request body is too large'), 413),
  });

  return (
    new Hono()
      .use('/progress', limitBody)
      .use('/view', limitBody)
      .use(sessionMiddleware(deps.auth))
      // Where "continue reading" takes the reader in a story, already moved to a readable chapter.
      .get(
        '/progress/:publicId',
        requireAuth,
        validate('param', publicIdParamSchema),
        async (c) => {
          const progress = await getContinueReading(
            deps.db,
            c.var.authUser.id,
            c.req.valid('param').publicId,
          );
          return c.json({ progress }, 200);
        },
      )
      .get('/history', requireAuth, validate('query', historyQuery), async (c) => {
        const page = await listHistory(deps.db, c.var.authUser.id, c.req.valid('query').cursor);
        return c.json(page, 200);
      })
      .delete(
        '/history/:publicId',
        requireAuth,
        validate('param', publicIdParamSchema),
        async (c) => {
          await removeFromHistory(deps.db, c.var.authUser.id, c.req.valid('param').publicId);
          return c.body(null, 204);
        },
      )
      // Debounced saves while reading (typed `hc` call).
      .put('/progress', requireAuth, validate('json', readingProgressInput), async (c) => {
        const result = await saveReadingProgress(deps.db, c.var.authUser.id, c.req.valid('json'));
        if (!result.ok) return coreError(c, result.error);
        return c.body(null, 204);
      })
      // The last save when the page goes away, sent by `navigator.sendBeacon`: its body may
      // arrive as `text/plain`, so it is parsed by hand.
      .post('/progress', requireAuth, async (c) => {
        let raw: unknown = null;
        try {
          raw = JSON.parse(await c.req.text());
        } catch {
          // Falls through to the validation error.
        }
        const parsed = readingProgressInput.safeParse(raw);
        if (!parsed.success) {
          return c.json(errorBody('VALIDATION_ERROR', 'Invalid request data'), 400);
        }
        const result = await saveReadingProgress(deps.db, c.var.authUser.id, parsed.data);
        if (!result.ok) return coreError(c, result.error);
        return c.body(null, 204);
      })
      // One read, sent after the reader stayed 30 s on the chapter (guests too).
      .post('/view', validate('json', chapterViewInput), async (c) => {
        const { viewer, newId } = viewerOf(c, c.var.user?.id);
        const result = await recordChapterView(
          { db: deps.db, viewCounter: deps.viewCounter },
          { ...c.req.valid('json'), viewer, ip: deps.clientIp(c.req.raw), now: new Date() },
        );
        if (!result.ok) return coreError(c, result.error);
        if (newId) {
          setCookie(c, VIEWER_COOKIE, newId, {
            httpOnly: true,
            sameSite: 'Lax',
            secure: secureCookie,
            path: VIEWER_COOKIE_PATH,
            maxAge: VIEWER_COOKIE_MAX_AGE,
          });
        }
        return c.body(null, 204);
      })
  );
}
