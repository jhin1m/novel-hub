/**
 * Data for the public reading page. `getChapterPage` runs in route loaders during SSR: public pages
 * link to each other with full document loads, so browsers get chapters through the CDN-cached
 * HTML. Only the table of contents is fetched from the browser, when the reader opens it.
 */
import { getChapterForReading, getChapterToc as loadChapterToc } from '@novel-hub/core';
import { isValidPublicId } from '@novel-hub/shared';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { getInfra } from '../server/infra';

const publicIdSchema = z.string().refine(isValidPublicId);

export const getChapterPage = createServerFn({ method: 'GET' })
  .validator(
    z.object({ publicId: publicIdSchema, number: z.number().int().positive().max(2_147_483_647) }),
  )
  .handler(async ({ data }) => {
    const { db, env } = await getInfra();
    const page = await getChapterForReading(db, data.publicId, data.number);
    // The origin goes with the data so `head()` builds absolute canonical URLs without reading env
    // in shared code.
    return page ? { ...page, appUrl: env.APP_URL } : null;
  });

/** Table of contents, loaded when the reader opens it. `null`: the story cannot be seen. */
export const getChapterToc = createServerFn({ method: 'GET' })
  .validator(z.object({ publicId: publicIdSchema }))
  .handler(async ({ data }) => {
    const { db } = await getInfra();
    return loadChapterToc(db, data.publicId);
  });
