import type { Db } from '@novel-hub/db';
import { HOME_DEDUPE_SLACK, NOTABLE_LIMIT, type storyListQuery } from '@novel-hub/shared';
import type { z } from 'zod';
import { getAuthorPage } from './author-page';
import { listNotable, listRecentlyUpdated } from './home';
import { listRecentlyCompleted } from './recently-completed';
import type { ListOptions, StoryCardDto } from './story-card';
import { getTagPage } from './tag-page';

export interface StoryList {
  stories: StoryCardDto[];
  page: number;
  totalPages: number;
}

/**
 * One of the public lists, as the client reloads it once it knows the reader allowed 18+
 * content. `null` when the tag or author has no page (a merged tag is not followed: the pages
 * only ever ask for canonical tags). Rankings come from Redis and can be unavailable, so they are
 * read with `readRanking` instead.
 */
export async function listStories(
  db: Db,
  query: Exclude<z.output<typeof storyListQuery>, { list: 'ranking' }>,
  o: ListOptions,
): Promise<StoryList | null> {
  switch (query.list) {
    case 'recent': {
      const { items, page, totalPages } = await listRecentlyUpdated(db, {
        ...o,
        page: query.page ?? 1,
      });
      return { stories: items, page, totalPages };
    }
    case 'notable':
      // With some to spare, so a client can drop stories it already shows and still fill a list.
      return {
        stories: await listNotable(db, { ...o, limit: NOTABLE_LIMIT + HOME_DEDUPE_SLACK }),
        page: 1,
        totalPages: 1,
      };
    case 'completed':
      return { stories: await listRecentlyCompleted(db, o), page: 1, totalPages: 1 };
    case 'tag': {
      const result = await getTagPage(db, query.tag, {
        ...o,
        page: query.page ?? 1,
        noAi: query.noAi,
      });
      if (result?.kind !== 'ok') return null;
      const { items, page, totalPages } = result.stories;
      return { stories: items, page, totalPages };
    }
    case 'author': {
      const result = await getAuthorPage(db, query.author, o);
      return result ? { stories: result.stories, page: 1, totalPages: 1 } : null;
    }
  }
}
