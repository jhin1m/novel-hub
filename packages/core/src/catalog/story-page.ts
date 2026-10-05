import { type Db, stories, storyTags, tags, users } from '@novel-hub/db';
import type { StoryStatus } from '@novel-hub/shared';
import { eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { isStoryPubliclyVisible } from '../access/can-read-chapter';
import { listReadableChapters } from '../reader/get-chapter-for-reading';
import { type TagView, compareTags } from '../stories/story-view';
import { chaptersPerWeek } from './frequency';

/** Everything the public story page renders. No internal ids. */
export interface StoryPageData {
  story: {
    publicId: string;
    slug: string;
    title: string;
    synopsis: string;
    coverUrl: string | null;
    author: { username: string; displayName: string };
    mainTag: TagView;
    /** Canonical tags besides the main one, by kind then Vietnamese name. */
    tags: TagView[];
    status: StoryStatus;
    chapterCount: number;
    wordCount: number;
    lastChapterAt: string | null;
    isAiAssisted: boolean;
    isMature: boolean;
  };
  /** Readable chapters in reading order (the table of contents). */
  chapters: { number: number; title: string | null }[];
  /** Release pace over the last 30 days; `null` when there is too little to tell. */
  chaptersPerWeek: number | null;
}

const canonical = alias(tags, 'canonical');
const mainTag = alias(tags, 'main_tag');
const mainCanonical = alias(tags, 'main_canonical');

/**
 * A story as its public page shows it, or `null` when it does not exist or cannot be seen
 * (`isStoryPubliclyVisible`). 18+ stories are returned: the page shows its warning screen.
 */
export async function getStoryPage(
  db: Db,
  publicId: string,
  now: Date = new Date(),
): Promise<StoryPageData | null> {
  const [row] = await db
    .select({
      id: stories.id,
      publicId: stories.publicId,
      slug: stories.slug,
      title: stories.title,
      synopsis: stories.synopsis,
      coverUrl: stories.coverUrl,
      mainTagSlug: sql<string>`coalesce(${mainCanonical.slug}, ${mainTag.slug})`,
      mainTagName: sql<string>`coalesce(${mainCanonical.name}, ${mainTag.name})`,
      status: stories.status,
      visibility: stories.visibility,
      chapterCount: stories.chapterCount,
      wordCount: stories.wordCount,
      lastChapterAt: stories.lastChapterAt,
      isAiAssisted: stories.isAiAssisted,
      isMature: stories.isMature,
      authorUsername: users.username,
      authorDisplayName: users.displayName,
      authorStatus: users.status,
    })
    .from(stories)
    .innerJoin(users, eq(users.id, stories.authorId))
    .innerJoin(mainTag, eq(mainTag.id, stories.mainTagId))
    .leftJoin(mainCanonical, eq(mainCanonical.id, mainTag.canonicalId))
    .where(eq(stories.publicId, publicId))
    .limit(1);
  if (
    !row ||
    !isStoryPubliclyVisible({ visibility: row.visibility, authorStatus: row.authorStatus })
  )
    return null;

  const [tagRows, chapters] = await Promise.all([
    db
      .select({
        slug: sql<string>`coalesce(${canonical.slug}, ${tags.slug})`,
        name: sql<string>`coalesce(${canonical.name}, ${tags.name})`,
        kind: sql<TagView['kind']>`coalesce(${canonical.kind}, ${tags.kind})`,
      })
      .from(storyTags)
      .innerJoin(tags, eq(tags.id, storyTags.tagId))
      .leftJoin(canonical, eq(canonical.id, tags.canonicalId))
      .where(eq(storyTags.storyId, row.id)),
    listReadableChapters(db, row.id),
  ]);

  // A merged tag and its canonical tag can both be linked: keep one entry per canonical slug.
  const bySlug = new Map<string, TagView>();
  for (const tag of tagRows) {
    if (tag.slug !== row.mainTagSlug) bySlug.set(tag.slug, tag);
  }

  return {
    story: {
      publicId: row.publicId,
      slug: row.slug,
      title: row.title,
      synopsis: row.synopsis,
      coverUrl: row.coverUrl,
      author: { username: row.authorUsername, displayName: row.authorDisplayName },
      // The main tag is always a genre (checked when the story is saved).
      mainTag: { slug: row.mainTagSlug, name: row.mainTagName, kind: 'genre' },
      tags: [...bySlug.values()].sort(compareTags),
      status: row.status,
      chapterCount: row.chapterCount,
      wordCount: row.wordCount,
      lastChapterAt: row.lastChapterAt?.toISOString() ?? null,
      isAiAssisted: row.isAiAssisted,
      isMature: row.isMature,
    },
    chapters: chapters.map(({ number, title }) => ({ number, title })),
    chaptersPerWeek: chaptersPerWeek(
      chapters.map((c) => c.publishedAt),
      now,
    ),
  };
}
