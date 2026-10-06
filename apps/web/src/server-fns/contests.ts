/**
 * Data of the public contest pages, loaded by route loaders during SSR. 18+ stories can never
 * enter a contest, and entries of hidden stories or banned authors are left out, so the HTML is
 * the same for everyone and cached publicly.
 */
import { getContestPage as loadContestPage, listContestsPage } from '@novel-hub/core';
import { contestSlugSchema } from '@novel-hub/shared';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { getInfra } from '../server/infra';

export const getContestsPage = createServerFn({ method: 'GET' }).handler(async () => {
  const { db } = await getInfra();
  return listContestsPage(db);
});

export const getContestPage = createServerFn({ method: 'GET' })
  .validator(z.object({ slug: contestSlugSchema, page: z.number().int().positive().max(100_000) }))
  .handler(async ({ data }) => {
    const { db } = await getInfra();
    return loadContestPage(db, data.slug, data.page);
  });
