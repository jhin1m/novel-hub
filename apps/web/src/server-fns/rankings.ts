/**
 * Data of the ranking pages, loaded by route loaders during SSR. Like every cached list, the
 * general ranking only: readers who allowed 18+ content reload it from `/api/v1/stories`.
 */
import { readRanking } from '@novel-hub/core';
import { RANKING_PERIODS } from '@novel-hub/shared';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { getInfra } from '../server/infra';

export const getRankingPage = createServerFn({ method: 'GET' })
  .validator(z.object({ period: z.enum(RANKING_PERIODS) }))
  .handler(async ({ data }) => {
    const { db, rankings } = await getInfra();
    return readRanking(db, rankings, data.period, { includeMature: false });
  });
