import { type Db, chapterContents, chapters, stories, storyTags, tags, users } from '@novel-hub/db';
import { and, asc, eq, gt, lt, max, min, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { canReadChapter, readableChapterWhere } from '../access/can-read-chapter';

/** Everything the reading page renders. No internal ids. */
export interface ChapterPageData {
  story: {
    publicId: string;
    slug: string;
    title: string;
    isMature: boolean;
    authorUsername: string;
    authorDisplayName: string;
    /** Canonical `warning` tags, shown on the 18+ screen; empty for other stories. */
    warningTags: { slug: string; name: string }[];
  };
  chapter: {
    number: number;
    title: string | null;
    authorNote: string | null;
    /** Sanitized when the chapter was published. */
    html: string;
    wordCount: number;
    publishedAt: Date;
  };
  prevNumber: number | null;
  nextNumber: number | null;
}

/**
 * A chapter as the public reading page shows it, or `null` when it does not exist or cannot be
 * read (`canReadChapter`). Previous/next skip chapters that cannot be read.
 */
export async function getChapterForReading(
  db: Db,
  publicId: string,
  number: number,
): Promise<ChapterPageData | null> {
  const [row] = await db
    .select({
      storyId: stories.id,
      publicId: stories.publicId,
      slug: stories.slug,
      storyTitle: stories.title,
      isMature: stories.isMature,
      visibility: stories.visibility,
      authorUsername: users.username,
      authorDisplayName: users.displayName,
      authorStatus: users.status,
      number: chapters.number,
      chapterTitle: chapters.title,
      authorNote: chapters.authorNote,
      wordCount: chapters.wordCount,
      status: chapters.status,
      publishedAt: chapters.publishedAt,
      deletedAt: chapters.deletedAt,
      html: chapterContents.html,
    })
    .from(stories)
    .innerJoin(users, eq(users.id, stories.authorId))
    .innerJoin(chapters, and(eq(chapters.storyId, stories.id), eq(chapters.number, number)))
    .leftJoin(chapterContents, eq(chapterContents.chapterId, chapters.id))
    .where(eq(stories.publicId, publicId))
    .limit(1);
  if (!row) return null;
  const decision = canReadChapter(null, {
    status: row.status,
    deletedAt: row.deletedAt,
    story: { visibility: row.visibility, authorStatus: row.authorStatus },
  });
  // A published chapter always has content and a publish time; guard anyway so a broken row
  // answers 404 instead of rendering an empty page.
  if (!decision.readable || row.html === null || row.publishedAt === null) return null;

  const [neighbours, warningTags] = await Promise.all([
    neighbourNumbers(db, row.storyId, number),
    row.isMature ? listWarningTags(db, row.storyId) : Promise.resolve([]),
  ]);
  return {
    story: {
      publicId: row.publicId,
      slug: row.slug,
      title: row.storyTitle,
      isMature: row.isMature,
      authorUsername: row.authorUsername,
      authorDisplayName: row.authorDisplayName,
      warningTags,
    },
    chapter: {
      number: row.number,
      title: row.chapterTitle,
      authorNote: row.authorNote,
      html: row.html,
      wordCount: row.wordCount,
      publishedAt: row.publishedAt,
    },
    ...neighbours,
  };
}

/** Readable chapters of a story the caller already found publicly visible, in reading order. */
export async function listReadableChapters(
  db: Db,
  storyId: string,
): Promise<{ number: number; title: string | null; publishedAt: Date }[]> {
  const rows = await db
    .select({ number: chapters.number, title: chapters.title, publishedAt: chapters.publishedAt })
    .from(chapters)
    .innerJoin(stories, eq(stories.id, chapters.storyId))
    .innerJoin(users, eq(users.id, stories.authorId))
    .where(and(eq(chapters.storyId, storyId), readableChapterWhere()))
    .orderBy(asc(chapters.number));
  // `publishedAt` is set on every published chapter; the filter only narrows the type.
  return rows.flatMap((r) => (r.publishedAt ? [{ ...r, publishedAt: r.publishedAt }] : []));
}

async function neighbourNumbers(
  db: Db,
  storyId: string,
  number: number,
): Promise<{ prevNumber: number | null; nextNumber: number | null }> {
  // Both bounds in one statement over the story's readable chapters (a few hundred at most).
  const [row] = await db
    .select({
      prevNumber: max(sql`case when ${lt(chapters.number, number)} then ${chapters.number} end`),
      nextNumber: min(sql`case when ${gt(chapters.number, number)} then ${chapters.number} end`),
    })
    .from(chapters)
    .innerJoin(stories, eq(stories.id, chapters.storyId))
    .innerJoin(users, eq(users.id, stories.authorId))
    .where(and(eq(chapters.storyId, storyId), readableChapterWhere()));
  return {
    prevNumber: toNumber(row?.prevNumber),
    nextNumber: toNumber(row?.nextNumber),
  };
}

function toNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

/** Warning tags of a story, merged tags replaced by their canonical tag, by Vietnamese name. */
async function listWarningTags(db: Db, storyId: string): Promise<{ slug: string; name: string }[]> {
  const canonical = alias(tags, 'canonical');
  const rows = await db
    .select({
      slug: sql<string>`coalesce(${canonical.slug}, ${tags.slug})`,
      name: sql<string>`coalesce(${canonical.name}, ${tags.name})`,
      kind: sql<string>`coalesce(${canonical.kind}, ${tags.kind})`,
    })
    .from(storyTags)
    .innerJoin(tags, eq(tags.id, storyTags.tagId))
    .leftJoin(canonical, eq(canonical.id, tags.canonicalId))
    .where(eq(storyTags.storyId, storyId));
  const bySlug = new Map<string, { slug: string; name: string }>();
  for (const tag of rows) {
    if (tag.kind === 'warning') bySlug.set(tag.slug, { slug: tag.slug, name: tag.name });
  }
  return [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}
