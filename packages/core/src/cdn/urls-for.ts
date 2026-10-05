import { type Db, chapters, stories, users } from '@novel-hub/db';
import { canonicalPath } from '@novel-hub/shared';
import { and, asc, eq, isNotNull } from 'drizzle-orm';
import type { ContentChange } from '../content/hooks';
import { neighbourNumbers } from '../reader/get-chapter-for-reading';

/**
 * The absolute URLs of the cached public pages a change may have altered, built from the current
 * state of the database (so a job that runs late or twice still purges the right pages). Only
 * canonical URLs: variants of a URL only ever hold a 301 to it.
 */
export async function urlsFor(db: Db, change: ContentChange, appUrl: string): Promise<string[]> {
  switch (change.entity) {
    case 'chapter':
      return chapterUrls(db, change.storyId, change.chapterNumber, appUrl);
    case 'story': {
      const slugs = change.previousSlug ? [change.previousSlug] : [];
      return storyUrlsEverPublished(db, change.storyId, appUrl, slugs);
    }
    case 'user':
      return authorUrls(db, change.userId, appUrl);
    default: {
      const unhandled: never = change;
      throw new Error(`Unhandled content change ${JSON.stringify(unhandled)}`);
    }
  }
}

/**
 * The story page and every chapter that was ever published (whatever its state now: hidden,
 * deleted, or the whole story hidden or its author banned), under the current slug and every slug
 * in `extraSlugs`. Listing only readable chapters would purge nothing exactly when a story is
 * taken down. Unknown story → no URL.
 */
export async function storyUrlsEverPublished(
  db: Db,
  storyId: string,
  appUrl: string,
  extraSlugs: readonly string[] = [],
): Promise<string[]> {
  const [story] = await db
    .select({ slug: stories.slug, publicId: stories.publicId })
    .from(stories)
    .where(eq(stories.id, storyId))
    .limit(1);
  if (!story) return [];
  const numbers = await db
    .select({ number: chapters.number })
    .from(chapters)
    .where(and(eq(chapters.storyId, storyId), isNotNull(chapters.publishedAt)))
    .orderBy(asc(chapters.number));
  const urls = new Set<string>();
  for (const slug of new Set([story.slug, ...extraSlugs])) {
    const target = { slug, publicId: story.publicId };
    urls.add(absolute(canonicalPath({ kind: 'story', ...target }), appUrl));
    for (const { number } of numbers) {
      urls.add(absolute(canonicalPath({ kind: 'chapter', ...target, number }), appUrl));
    }
  }
  return [...urls];
}

/** `storyUrlsEverPublished` addressed by public id (manual purge); `null` for an unknown story. */
export async function storyUrlsByPublicId(
  db: Db,
  publicId: string,
  appUrl: string,
): Promise<string[] | null> {
  const [story] = await db
    .select({ id: stories.id })
    .from(stories)
    .where(eq(stories.publicId, publicId))
    .limit(1);
  return story ? storyUrlsEverPublished(db, story.id, appUrl) : null;
}

/** The chapter, its readable neighbours (their prev/next links changed) and the story page. */
async function chapterUrls(
  db: Db,
  storyId: string,
  number: number,
  appUrl: string,
): Promise<string[]> {
  const [story] = await db
    .select({ slug: stories.slug, publicId: stories.publicId })
    .from(stories)
    .where(eq(stories.id, storyId))
    .limit(1);
  if (!story) return [];
  const { prevNumber, nextNumber } = await neighbourNumbers(db, storyId, number);
  const urls = new Set([absolute(canonicalPath({ kind: 'story', ...story }), appUrl)]);
  for (const n of [prevNumber, number, nextNumber]) {
    if (n !== null)
      urls.add(absolute(canonicalPath({ kind: 'chapter', ...story, number: n }), appUrl));
  }
  return [...urls];
}

/** The author page and every page of every story by the author (name or ban shows on them). */
async function authorUrls(db: Db, userId: string, appUrl: string): Promise<string[]> {
  const [author] = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!author) return [];
  const owned = await db
    .select({ id: stories.id })
    .from(stories)
    .where(eq(stories.authorId, userId))
    .orderBy(asc(stories.createdAt));
  const urls = new Set([
    absolute(canonicalPath({ kind: 'author', username: author.username }), appUrl),
  ]);
  for (const { id } of owned) {
    for (const url of await storyUrlsEverPublished(db, id, appUrl)) urls.add(url);
  }
  return [...urls];
}

function absolute(path: string, appUrl: string): string {
  return new URL(path, appUrl).href;
}
