/**
 * Data for the public catalog pages (story, author, tag, home), loaded by route loaders during SSR.
 * The HTML is cached publicly, so every list here leaves 18+ stories out: there is no parameter to
 * ask for them. Readers who allowed 18+ content reload the lists from `/api/v1/stories`.
 */
import {
  getAuthorPage as loadAuthorPage,
  getHomePage as loadHomePage,
  getStoryPage as loadStoryPage,
  getTagPage as loadTagPage,
  listGenres,
} from '@novel-hub/core';
import { isValidPublicId, tagSlugSchema, usernameParamSchema } from '@novel-hub/shared';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { getInfra } from '../server/infra';

const SSR_LISTS = { includeMature: false };

export const getStoryPage = createServerFn({ method: 'GET' })
  .validator(z.object({ publicId: z.string().refine(isValidPublicId) }))
  .handler(async ({ data }) => {
    const { db } = await getInfra();
    return loadStoryPage(db, data.publicId);
  });

export const getAuthorPage = createServerFn({ method: 'GET' })
  .validator(z.object({ username: usernameParamSchema }))
  .handler(async ({ data }) => {
    const { db } = await getInfra();
    return loadAuthorPage(db, data.username, SSR_LISTS);
  });

export const getTagPage = createServerFn({ method: 'GET' })
  .validator(z.object({ slug: tagSlugSchema, page: z.number().int().positive().max(100_000) }))
  .handler(async ({ data }) => {
    const { db } = await getInfra();
    return loadTagPage(db, data.slug, { ...SSR_LISTS, page: data.page });
  });

export const getHomePage = createServerFn({ method: 'GET' }).handler(async () => {
  const { db } = await getInfra();
  return loadHomePage(db);
});

/** Filters of the search page: the genres to pick from (results load in the browser). */
export const getSearchFilters = createServerFn({ method: 'GET' }).handler(async () => {
  const { db } = await getInfra();
  return { genres: await listGenres(db) };
});
