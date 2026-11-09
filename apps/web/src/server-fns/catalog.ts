/**
 * Data for the public catalog pages (story, author, tag, home), loaded by route loaders during SSR.
 * The HTML is cached publicly, so every list here leaves 18+ stories out: there is no parameter to
 * ask for them. Readers who allowed 18+ content reload the lists from `/api/v1/stories`.
 */
import {
  getAuthorPage as loadAuthorPage,
  getExploreEntry,
  getHomePage as loadHomePage,
  getStoryPage as loadStoryPage,
  getTagPage as loadTagPage,
  listGenres,
  readHomeRankings,
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
  .validator(
    z.object({
      slug: tagSlugSchema,
      page: z.number().int().positive().max(100_000),
      noAi: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    const { db } = await getInfra();
    return loadTagPage(db, data.slug, { ...SSR_LISTS, page: data.page, noAi: data.noAi });
  });

/** The home lists (Postgres) and its short rankings (Redis), read side by side. */
export const getHomePage = createServerFn({ method: 'GET' }).handler(async () => {
  const { db, rankings } = await getInfra();
  const [home, homeRankings] = await Promise.all([
    loadHomePage(db),
    readHomeRankings(db, rankings),
  ]);
  return { ...home, rankings: homeRankings };
});

/**
 * The explore page (`/search`): the genres for its chips and, only before any filter is picked,
 * its entry rows (Postgres and the weekly ranking in Redis). Results load in the browser.
 */
export const getExplorePage = createServerFn({ method: 'GET' })
  .validator(z.object({ unfiltered: z.boolean() }))
  .handler(async ({ data }) => {
    const { db, rankings } = await getInfra();
    const [genres, entry] = await Promise.all([
      listGenres(db),
      data.unfiltered ? getExploreEntry(db, rankings) : null,
    ]);
    return { genres, entry };
  });
