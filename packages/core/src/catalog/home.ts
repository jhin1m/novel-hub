import { type Db, stories, tags } from '@novel-hub/db';
import { CATALOG_PAGE_SIZE, HOME_LISTING_RULES, NOTABLE_LIMIT } from '@novel-hub/shared';
import { type SQL, and, desc, eq, gte, isNotNull, isNull, notInArray } from 'drizzle-orm';
import { type TagView, compareTags } from '../stories/story-view';
import { withLatestChapters } from './latest-chapters';
import {
  type ListOptions,
  type Paged,
  type StoryCardDto,
  countStories,
  publicStoryWhere,
  recentlyUpdatedOrder,
  selectStoryCards,
  toStoryCard,
  totalPagesFor,
} from './story-card';

const DAY_MS = 24 * 60 * 60 * 1000;

/** What a "notable new story" needs until reading numbers exist (stage 2 replaces this). */
const NOTABLE_RULE = { maxAgeDays: 30, minChapters: 3, minWords: 10_000 };

/**
 * Enough published text to show in the home page lists. Both counters only count published,
 * undeleted chapters (`recomputeStoryCounters`), so a story with 3+ chapters also has
 * `last_chapter_at`.
 */
export function homeListingWhere(): SQL {
  return and(
    gte(stories.chapterCount, HOME_LISTING_RULES.minChapters),
    gte(stories.wordCount, HOME_LISTING_RULES.minWords),
  ) as SQL;
}

export function recentlyUpdatedWhere(o: ListOptions): SQL {
  return and(publicStoryWhere(o), isNotNull(stories.lastChapterAt), homeListingWhere()) as SQL;
}

/**
 * Public stories past the home listing threshold, most recently updated first, each with its
 * latest chapter: the home page's "recently updated" list (and its 18+ variant, loaded in the
 * browser).
 */
export async function listRecentlyUpdated(
  db: Db,
  o: ListOptions & { page?: number; pageSize?: number },
): Promise<Paged<StoryCardDto>> {
  const page = o.page ?? 1;
  const pageSize = o.pageSize ?? CATALOG_PAGE_SIZE;
  const where = recentlyUpdatedWhere(o);
  const [rows, total] = await Promise.all([
    selectStoryCards(db)
      .where(where)
      .orderBy(...recentlyUpdatedOrder)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    countStories(db, where),
  ]);
  return {
    items: await withLatestChapters(db, rows),
    page,
    totalPages: totalPagesFor(total, pageSize),
  };
}

/**
 * "Notable new stories": public stories created in the last 30 days with at least 3 chapters and
 * 10,000 words, most recently updated first. When fewer qualify, the newest public stories past
 * the home listing threshold fill the remaining places.
 */
export async function listNotable(
  db: Db,
  o: ListOptions & { limit?: number; now?: Date },
): Promise<StoryCardDto[]> {
  const limit = o.limit ?? NOTABLE_LIMIT;
  const since = new Date((o.now ?? new Date()).getTime() - NOTABLE_RULE.maxAgeDays * DAY_MS);
  const qualifying = await selectStoryCards(db)
    .where(
      and(
        publicStoryWhere(o),
        isNotNull(stories.lastChapterAt),
        gte(stories.createdAt, since),
        gte(stories.chapterCount, NOTABLE_RULE.minChapters),
        gte(stories.wordCount, NOTABLE_RULE.minWords),
      ),
    )
    .orderBy(...recentlyUpdatedOrder)
    .limit(limit);
  if (qualifying.length >= limit) return qualifying.map(toStoryCard);

  const taken = qualifying.map((r) => r.id);
  const filler = await selectStoryCards(db)
    .where(
      and(
        publicStoryWhere(o),
        homeListingWhere(),
        taken.length > 0 ? notInArray(stories.id, taken) : undefined,
      ),
    )
    .orderBy(desc(stories.createdAt), desc(stories.id))
    .limit(limit - qualifying.length);
  return [...qualifying, ...filler].map(toStoryCard);
}

/** Canonical genre tags, the home page's way into the tag pages. */
export async function listGenres(db: Db): Promise<TagView[]> {
  const rows = await db
    .select({ slug: tags.slug, name: tags.name, kind: tags.kind })
    .from(tags)
    .where(and(eq(tags.kind, 'genre'), isNull(tags.canonicalId)));
  return rows.sort(compareTags);
}
