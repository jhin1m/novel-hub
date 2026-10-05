import { type Db, stories, tags, users } from '@novel-hub/db';
import type { StoryStatus } from '@novel-hub/shared';
import { type SQL, and, count, desc, eq, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

/** A story as every public list shows it (spec section 8). No internal ids. */
export interface StoryCardDto {
  publicId: string;
  slug: string;
  title: string;
  coverUrl: string | null;
  author: { username: string; displayName: string };
  mainTag: { slug: string; name: string };
  status: StoryStatus;
  chapterCount: number;
  wordCount: number;
  lastChapterAt: string | null;
  isAiAssisted: boolean;
  isMature: boolean;
}

export interface ListOptions {
  /**
   * Derived on the server from the signed-in account, never from a request parameter. Server-
   * rendered (publicly cached) lists always pass `false`.
   */
  includeMature: boolean;
}

export interface Paged<T> {
  items: T[];
  page: number;
  /** At least 1, so an empty list still has its first page. */
  totalPages: number;
}

const mainTag = alias(tags, 'main_tag');
const mainCanonical = alias(tags, 'main_canonical');

/**
 * Columns of a story card. The main tag is reported as its canonical tag, in case it was merged
 * after the story was saved. `id` stays on the server (`toStoryCard` drops it).
 */
export const storyCardColumns = {
  id: stories.id,
  publicId: stories.publicId,
  slug: stories.slug,
  title: stories.title,
  coverUrl: stories.coverUrl,
  authorUsername: users.username,
  authorDisplayName: users.displayName,
  mainTagSlug: sql<string>`coalesce(${mainCanonical.slug}, ${mainTag.slug})`,
  mainTagName: sql<string>`coalesce(${mainCanonical.name}, ${mainTag.name})`,
  status: stories.status,
  chapterCount: stories.chapterCount,
  wordCount: stories.wordCount,
  lastChapterAt: stories.lastChapterAt,
  isAiAssisted: stories.isAiAssisted,
  isMature: stories.isMature,
};

/** `select … from stories` joined with everything a card needs; callers add where/order/limit. */
export function selectStoryCards(db: Db) {
  return db
    .select(storyCardColumns)
    .from(stories)
    .innerJoin(users, eq(users.id, stories.authorId))
    .innerJoin(mainTag, eq(mainTag.id, stories.mainTagId))
    .leftJoin(mainCanonical, eq(mainCanonical.id, mainTag.canonicalId));
}

export type StoryCardRow = Awaited<ReturnType<typeof selectStoryCards>>[number];

export function toStoryCard(row: StoryCardRow): StoryCardDto {
  return {
    publicId: row.publicId,
    slug: row.slug,
    title: row.title,
    coverUrl: row.coverUrl,
    author: { username: row.authorUsername, displayName: row.authorDisplayName },
    mainTag: { slug: row.mainTagSlug, name: row.mainTagName },
    status: row.status,
    chapterCount: row.chapterCount,
    wordCount: row.wordCount,
    lastChapterAt: row.lastChapterAt?.toISOString() ?? null,
    isAiAssisted: row.isAiAssisted,
    isMature: row.isMature,
  };
}

/**
 * Stories any public list may show, over rows joining `stories` and the author in `users`: the
 * same rule as `isStoryPubliclyVisible` (published, author not banned), plus no 18+ story unless
 * `includeMature`. Banning only flips the user status; this filter is what hides the stories.
 */
export function publicStoryWhere(o: ListOptions): SQL {
  return and(
    eq(stories.visibility, 'published'),
    ne(users.status, 'banned'),
    o.includeMature ? undefined : eq(stories.isMature, false),
  ) as SQL;
}

/**
 * "Most recently updated first", written out so it matches the `DESC NULLS LAST` index on
 * `last_chapter_at` (Drizzle's `desc()` sorts nulls first). `id` breaks ties so pages are stable.
 */
export const recentlyUpdatedOrder = [
  sql`${stories.lastChapterAt} desc nulls last`,
  desc(stories.id),
] as const;

/** Number of stories matching `where` over the same joins as `selectStoryCards`. */
export async function countStories(db: Db, where: SQL): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(stories)
    .innerJoin(users, eq(users.id, stories.authorId))
    .where(where);
  return row?.n ?? 0;
}

/** Total pages for `total` items, never below 1. */
export function totalPagesFor(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
