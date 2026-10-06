import {
  applyModerationAction,
  createContest,
  createFeaturedSlot,
  deleteFeaturedSlot,
  endFeaturedSlot,
  listContestEntriesForMods,
  listContestsForMods,
  listFeaturedSlotsForMods,
  listReports,
  setPlacement,
  updateContest,
} from '@novel-hub/core';
import {
  contestIdParamSchema,
  contestInputSchema,
  contestPlacementSchema,
  featuredSlotCreateSchema,
  featuredSlotIdParamSchema,
  moderationActionSchema,
  reportListQuerySchema,
} from '@novel-hub/shared';
import { Hono } from 'hono';
import type { ApiDeps } from '../deps';
import { coreError } from '../lib/core-errors';
import { validate } from '../lib/validate';
import { requireRole } from '../middleware/require-auth';
import { sessionMiddleware } from '../middleware/session';

/**
 * The moderation queue, one-click actions, the home page's featured stories and themed contests. Two permission
 * layers: the role here, and `canModerate`/`canModerateUser` in core (which also refuses a muted
 * moderator).
 */
export function createModerationRoutes(deps: Pick<ApiDeps, 'auth' | 'db'>) {
  return new Hono()
    .use(sessionMiddleware(deps.auth))
    .use(requireRole('mod', 'admin'))
    .get('/reports', validate('query', reportListQuerySchema), async (c) => {
      const result = await listReports(deps.db, c.var.authUser, c.req.valid('query'));
      if (!result.ok) return coreError(c, result.error);
      return c.json(result.value, 200);
    })
    .post('/actions', validate('json', moderationActionSchema), async (c) => {
      const result = await applyModerationAction(deps.db, c.var.authUser, c.req.valid('json'));
      if (!result.ok) return coreError(c, result.error);
      return c.json(result.value, 200);
    })
    .get('/featured', async (c) => {
      const result = await listFeaturedSlotsForMods(deps.db, c.var.authUser);
      if (!result.ok) return coreError(c, result.error);
      return c.json(result.value, 200);
    })
    .post('/featured', validate('json', featuredSlotCreateSchema), async (c) => {
      const result = await createFeaturedSlot(deps.db, c.var.authUser, c.req.valid('json'));
      if (!result.ok) return coreError(c, result.error);
      return c.json(result.value, 201);
    })
    .post('/featured/:id/end', validate('param', featuredSlotIdParamSchema), async (c) => {
      const result = await endFeaturedSlot(deps.db, c.var.authUser, c.req.valid('param').id);
      if (!result.ok) return coreError(c, result.error);
      return c.json(result.value, 200);
    })
    .delete('/featured/:id', validate('param', featuredSlotIdParamSchema), async (c) => {
      const result = await deleteFeaturedSlot(deps.db, c.var.authUser, c.req.valid('param').id);
      if (!result.ok) return coreError(c, result.error);
      return c.json(result.value, 200);
    })
    .get('/contests', async (c) => {
      const result = await listContestsForMods(deps.db, c.var.authUser);
      if (!result.ok) return coreError(c, result.error);
      return c.json(result.value, 200);
    })
    .post('/contests', validate('json', contestInputSchema), async (c) => {
      const result = await createContest(deps.db, c.var.authUser, c.req.valid('json'));
      if (!result.ok) return coreError(c, result.error);
      return c.json(result.value, 201);
    })
    .patch(
      '/contests/:id',
      validate('param', contestIdParamSchema),
      validate('json', contestInputSchema),
      async (c) => {
        const { id } = c.req.valid('param');
        const result = await updateContest(deps.db, c.var.authUser, id, c.req.valid('json'));
        if (!result.ok) return coreError(c, result.error);
        return c.json(result.value, 200);
      },
    )
    .get('/contests/:id/entries', validate('param', contestIdParamSchema), async (c) => {
      const { id } = c.req.valid('param');
      const result = await listContestEntriesForMods(deps.db, c.var.authUser, id);
      if (!result.ok) return coreError(c, result.error);
      return c.json(result.value, 200);
    })
    .put(
      '/contests/:id/placements',
      validate('param', contestIdParamSchema),
      validate('json', contestPlacementSchema),
      async (c) => {
        const { id } = c.req.valid('param');
        const result = await setPlacement(deps.db, c.var.authUser, id, c.req.valid('json'));
        if (!result.ok) return coreError(c, result.error);
        return c.json(result.value, 200);
      },
    );
}
