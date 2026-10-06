import { type Db, chapters, stories, storyTags, tags, users } from '@novel-hub/db';
import { RANKING_PERIODS, canonicalPath } from '@novel-hub/shared';
import { type SQL, and, asc, count, eq, isNotNull, isNull } from 'drizzle-orm';
import { canReadChapter } from '../access/can-read-chapter';
import { publicStoryWhere, totalPagesFor } from '../catalog/story-card';
import { followMerges } from '../catalog/tag-page';
import type { SitemapEntry } from './xml';

/** URLs per child sitemap (the protocol allows 50,000; smaller files stay quick to build). */
export const SITEMAP_PAGE_SIZE = 10_000;

export interface SitemapPaging {
  pageSize?: number;
}

/**
 * Stories a search engine may list: the public-list rule without 18+ stories (they are never in
 * the sitemap), so drafts, stories hidden by a moderator and every story of a banned author stay
 * out.
 */
function sitemapStoryWhere(): SQL {
  return publicStoryWhere({ includeMature: false });
}

/** Readable chapters of those stories; rows are checked again with `canReadChapter`. */
function sitemapChapterWhere(): SQL {
  return and(
    sitemapStoryWhere(),
    eq(chapters.status, 'published'),
    isNull(chapters.deletedAt),
  ) as SQL;
}

/** Number of story and chapter sitemaps, at least one each (an empty one is still valid). */
export async function countSitemap(
  db: Db,
  o: SitemapPaging = {},
): Promise<{ storyPages: number; chapterPages: number }> {
  const pageSize = o.pageSize ?? SITEMAP_PAGE_SIZE;
  const [[storyCount], [chapterCount]] = await Promise.all([
    db
      .select({ n: count() })
      .from(stories)
      .innerJoin(users, eq(users.id, stories.authorId))
      .where(sitemapStoryWhere()),
    db
      .select({ n: count() })
      .from(chapters)
      .innerJoin(stories, eq(stories.id, chapters.storyId))
      .innerJoin(users, eq(users.id, stories.authorId))
      .where(sitemapChapterWhere()),
  ]);
  return {
    storyPages: totalPagesFor(storyCount?.n ?? 0, pageSize),
    chapterPages: totalPagesFor(chapterCount?.n ?? 0, pageSize),
  };
}

/**
 * Home, the static pages, the ranking pages, every canonical tag page and every author page that lists at least one
 * sitemap story with a chapter (the condition of those lists). A merged tag counts as the tag at
 * the end of its merge chain; a broken chain is left out.
 */
export async function listSitemapPages(db: Db): Promise<SitemapEntry[]> {
  const listed = and(sitemapStoryWhere(), isNotNull(stories.lastChapterAt)) as SQL;
  const [authors, usedTags, allTags] = await Promise.all([
    db
      .selectDistinct({ username: users.username })
      .from(stories)
      .innerJoin(users, eq(users.id, stories.authorId))
      .where(listed)
      .orderBy(asc(users.username)),
    db
      .selectDistinct({ tagId: storyTags.tagId })
      .from(storyTags)
      .innerJoin(stories, eq(stories.id, storyTags.storyId))
      .innerJoin(users, eq(users.id, stories.authorId))
      .where(listed),
    db.select({ id: tags.id, slug: tags.slug, canonicalId: tags.canonicalId }).from(tags),
  ]);

  const slugById = new Map(allTags.map((t) => [t.id, t.slug]));
  const merged = allTags.filter((t) => t.canonicalId !== null);
  const tagSlugs = new Set<string>();
  for (const { tagId } of usedTags) {
    const canonicalId = followMerges(tagId, merged);
    const slug = canonicalId ? slugById.get(canonicalId) : undefined;
    if (slug) tagSlugs.add(slug);
  }

  const page = (path: string): SitemapEntry => ({ path, lastmod: null });
  return [
    page(canonicalPath({ kind: 'home' })),
    page(canonicalPath({ kind: 'static', path: '/terms' })),
    page(canonicalPath({ kind: 'static', path: '/content-policy' })),
    ...RANKING_PERIODS.map((period) => page(canonicalPath({ kind: 'ranking', period }))),
    ...[...tagSlugs].sort().map((slug) => page(canonicalPath({ kind: 'tag', slug }))),
    ...authors.map((a) => page(canonicalPath({ kind: 'author', username: a.username }))),
  ];
}

/** Offset of `page`, or `null` when it is not a positive integer. */
function offsetOf(page: number, pageSize: number): number | null {
  return Number.isInteger(page) && page >= 1 ? (page - 1) * pageSize : null;
}

/**
 * Story pages of sitemap `page`, in a stable order (UUIDv7 id). `null` past the last page; the
 * first page always exists. `lastmod` is the later of the story edit and its newest chapter.
 */
export async function listSitemapStories(
  db: Db,
  page: number,
  o: SitemapPaging = {},
): Promise<SitemapEntry[] | null> {
  const pageSize = o.pageSize ?? SITEMAP_PAGE_SIZE;
  const offset = offsetOf(page, pageSize);
  if (offset === null) return null;
  const rows = await db
    .select({
      slug: stories.slug,
      publicId: stories.publicId,
      updatedAt: stories.updatedAt,
      lastChapterAt: stories.lastChapterAt,
    })
    .from(stories)
    .innerJoin(users, eq(users.id, stories.authorId))
    .where(sitemapStoryWhere())
    .orderBy(asc(stories.id))
    .limit(pageSize)
    .offset(offset);
  if (rows.length === 0 && page > 1) return null;
  return rows.map((r) => ({
    path: canonicalPath({ kind: 'story', slug: r.slug, publicId: r.publicId }),
    lastmod: r.lastChapterAt && r.lastChapterAt > r.updatedAt ? r.lastChapterAt : r.updatedAt,
  }));
}

/**
 * Chapter pages of sitemap `page`, in a stable order (UUIDv7 id). Every row also goes through
 * `canReadChapter`, the single read decision (spec section 10). `null` past the last page.
 */
export async function listSitemapChapters(
  db: Db,
  page: number,
  o: SitemapPaging = {},
): Promise<SitemapEntry[] | null> {
  const pageSize = o.pageSize ?? SITEMAP_PAGE_SIZE;
  const offset = offsetOf(page, pageSize);
  if (offset === null) return null;
  const rows = await db
    .select({
      number: chapters.number,
      status: chapters.status,
      deletedAt: chapters.deletedAt,
      updatedAt: chapters.updatedAt,
      slug: stories.slug,
      publicId: stories.publicId,
      visibility: stories.visibility,
      authorStatus: users.status,
    })
    .from(chapters)
    .innerJoin(stories, eq(stories.id, chapters.storyId))
    .innerJoin(users, eq(users.id, stories.authorId))
    .where(sitemapChapterWhere())
    .orderBy(asc(chapters.id))
    .limit(pageSize)
    .offset(offset);
  if (rows.length === 0 && page > 1) return null;
  return rows
    .filter(
      (r) =>
        canReadChapter(null, {
          status: r.status,
          deletedAt: r.deletedAt,
          story: { visibility: r.visibility, authorStatus: r.authorStatus },
        }).readable,
    )
    .map((r) => ({
      path: canonicalPath({
        kind: 'chapter',
        slug: r.slug,
        publicId: r.publicId,
        number: r.number,
      }),
      lastmod: r.updatedAt,
    }));
}
