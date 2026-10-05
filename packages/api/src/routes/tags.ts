import { listTags } from '@novel-hub/core';
import { Hono } from 'hono';
import type { ApiDeps } from '../deps';

/** Tag list for pickers. The same for everyone, so browsers may cache it briefly. */
export function createTagRoutes(deps: Pick<ApiDeps, 'db'>) {
  return new Hono().get('/', async (c) => {
    const tags = await listTags(deps.db);
    c.header('Cache-Control', 'public, max-age=300');
    return c.json({ tags }, 200);
  });
}
