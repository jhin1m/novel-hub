import { type Db, stories, storyTags, tags, users } from '@novel-hub/db';
import type { StoryStatus } from '@novel-hub/shared';
import { type SQL, and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { isStoryPubliclyVisible } from '../access/can-read-chapter';
import { type StoryCardDto, selectStoryCardsWith, toStoryCard } from '../catalog/story-card';

/**
 * A story in the `stories` index, keyed by `publicId`. Hits go straight to the browser, so no
 * internal id is stored. Dates are epoch seconds (sortable); a story without chapters has 0.
 */
export interface StoryDoc {
  publicId: string;
  slug: string;
  title: string;
  synopsis: string;
  authorUsername: string;
  authorName: string;
  coverUrl: string | null;
  mainTagSlug: string;
  mainTagName: string;
  /** Canonical slugs of every tag, the main tag included, so a genre filter finds it too. */
  tagSlugs: string[];
  status: StoryStatus;
  wordCount: number;
  chapterCount: number;
  lastChapterAt: number;
  createdAt: number;
  isMature: boolean;
  isAiAssisted: boolean;
}

/** An author in the `authors` index, keyed by `username` (never changes). */
export interface AuthorDoc {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  /** Public stories a guest can see (18+ left out). */
  storyCount: number;
}

/** A story as loaded for indexing: `doc` is `null` when it must not be in the index. */
export interface StoryDocRow {
  id: string;
  publicId: string;
  authorId: string;
  doc: StoryDoc | null;
}

export interface AuthorDocRow {
  id: string;
  username: string;
  doc: AuthorDoc | null;
}

const docTag = alias(tags, 'doc_tag');
const docTagCanonical = alias(tags, 'doc_tag_canonical');

const toEpochSeconds = (date: Date | null) => (date ? Math.floor(date.getTime() / 1000) : 0);

/** Canonical tag slugs of each story (a merged tag counts as the tag it was merged into). */
async function tagSlugsByStory(db: Db, storyIds: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (storyIds.length === 0) return result;
  const rows = await db
    .select({
      storyId: storyTags.storyId,
      slug: sql<string>`coalesce(${docTagCanonical.slug}, ${docTag.slug})`,
    })
    .from(storyTags)
    .innerJoin(docTag, eq(docTag.id, storyTags.tagId))
    .leftJoin(docTagCanonical, eq(docTagCanonical.id, docTag.canonicalId))
    .where(inArray(storyTags.storyId, storyIds));
  for (const row of rows) {
    const list = result.get(row.storyId) ?? [];
    list.push(row.slug);
    result.set(row.storyId, list);
  }
  return result;
}

/**
 * Search documents of the stories matching `where`, ordered by id. Stories nobody may see (not
 * published, hidden by a moderator, author banned) come back with `doc: null`, so callers delete
 * them; 18+ stories are indexed and filtered at query time.
 */
export async function loadStoryDocs(db: Db, where: SQL, limit: number): Promise<StoryDocRow[]> {
  const rows = await selectStoryCardsWith(db, {
    synopsis: stories.synopsis,
    createdAt: stories.createdAt,
    authorId: stories.authorId,
    visibility: stories.visibility,
    authorStatus: users.status,
  })
    .where(where)
    .orderBy(asc(stories.id))
    .limit(limit);
  const tagSlugs = await tagSlugsByStory(
    db,
    rows.map((row) => row.id),
  );
  return rows.map((row) => {
    const visible = isStoryPubliclyVisible({
      visibility: row.visibility,
      authorStatus: row.authorStatus,
    });
    const card = toStoryCard(row);
    return {
      id: row.id,
      publicId: row.publicId,
      authorId: row.authorId,
      doc: visible
        ? {
            publicId: card.publicId,
            slug: card.slug,
            title: card.title,
            synopsis: row.synopsis,
            authorUsername: card.author.username,
            authorName: card.author.displayName,
            coverUrl: card.coverUrl,
            mainTagSlug: card.mainTag.slug,
            mainTagName: card.mainTag.name,
            tagSlugs: [...new Set([card.mainTag.slug, ...(tagSlugs.get(row.id) ?? [])])],
            status: card.status,
            wordCount: card.wordCount,
            chapterCount: card.chapterCount,
            lastChapterAt: toEpochSeconds(row.lastChapterAt),
            createdAt: toEpochSeconds(row.createdAt),
            isMature: card.isMature,
            isAiAssisted: card.isAiAssisted,
          }
        : null,
    };
  });
}

/** The card the public lists show, rebuilt from a search hit. */
export function storyDocToCard(doc: StoryDoc): StoryCardDto {
  return {
    publicId: doc.publicId,
    slug: doc.slug,
    title: doc.title,
    coverUrl: doc.coverUrl,
    author: { username: doc.authorUsername, displayName: doc.authorName },
    mainTag: { slug: doc.mainTagSlug, name: doc.mainTagName },
    status: doc.status,
    chapterCount: doc.chapterCount,
    wordCount: doc.wordCount,
    lastChapterAt: doc.lastChapterAt > 0 ? new Date(doc.lastChapterAt * 1000).toISOString() : null,
    isAiAssisted: doc.isAiAssisted,
    isMature: doc.isMature,
  };
}

/**
 * Search documents of the users matching `where`, ordered by id. Only an author who is not banned
 * and has a published story is indexed (the same rule as the author page); the rest come back with
 * `doc: null`.
 */
export async function loadAuthorDocs(db: Db, where: SQL, limit: number): Promise<AuthorDocRow[]> {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      status: users.status,
      published: count(stories.id),
      general: sql<number>`count(*) filter (where ${stories.isMature} = false)`.mapWith(Number),
    })
    .from(users)
    .leftJoin(stories, and(eq(stories.authorId, users.id), eq(stories.visibility, 'published')))
    .where(where)
    .groupBy(users.id)
    .orderBy(asc(users.id))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    doc:
      row.status !== 'banned' && row.published > 0
        ? {
            username: row.username,
            displayName: row.displayName,
            avatarUrl: row.avatarUrl,
            storyCount: row.general,
          }
        : null,
  }));
}
