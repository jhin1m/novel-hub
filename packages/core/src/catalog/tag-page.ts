import { type Db, stories, storyTags, tags, users } from '@novel-hub/db';
import { CATALOG_PAGE_SIZE } from '@novel-hub/shared';
import { type SQL, and, count, eq, exists, inArray, isNotNull, sql } from 'drizzle-orm';
import type { TagView } from '../stories/story-view';
import {
  type ListOptions,
  type Paged,
  type StoryCardDto,
  publicStoryWhere,
  recentlyUpdatedOrder,
  selectStoryCards,
  toStoryCard,
  totalPagesFor,
} from './story-card';

/** Longest chain of merged tags followed before giving up (a cycle is a data error). */
const MAX_MERGE_HOPS = 3;

export type TagPageResult =
  | { kind: 'redirect'; slug: string }
  | {
      kind: 'ok';
      tag: TagView;
      stories: Paged<StoryCardDto>;
      /**
       * Last page that exists for any reader, 18+ stories included. A page past `totalPages` but
       * within it is not a 404: it is empty in the cached HTML and filled for readers who allowed
       * 18+ content, so their pagination never leads to a missing page.
       */
      lastPage: number;
    };

/**
 * A tag page: `redirect` when the tag was merged (to the canonical tag at the end of the chain),
 * otherwise the public stories with chapters tagged with it or with any tag merged into it, most
 * recently updated first. `null` for an unknown tag or a broken merge chain.
 */
export async function getTagPage(
  db: Db,
  slug: string,
  o: ListOptions & { page: number; pageSize?: number },
): Promise<TagPageResult | null> {
  const [tag] = await db
    .select({
      id: tags.id,
      slug: tags.slug,
      name: tags.name,
      kind: tags.kind,
      canonicalId: tags.canonicalId,
    })
    .from(tags)
    .where(eq(tags.slug, slug))
    .limit(1);
  if (!tag) return null;

  // Every merged tag (a small table): follows the chain up and collects the tags merged in.
  const merged = await db
    .select({ id: tags.id, canonicalId: tags.canonicalId })
    .from(tags)
    .where(isNotNull(tags.canonicalId));

  if (tag.canonicalId) {
    const target = followMerges(tag.canonicalId, merged);
    if (!target) return null;
    const [row] = await db.select({ slug: tags.slug }).from(tags).where(eq(tags.id, target));
    return row ? { kind: 'redirect', slug: row.slug } : null;
  }

  const tagIds = mergedInto(tag.id, merged);
  const pageSize = o.pageSize ?? CATALOG_PAGE_SIZE;
  const listed = and(
    publicStoryWhere({ includeMature: true }),
    isNotNull(stories.lastChapterAt),
    exists(
      db
        .select({ one: storyTags.storyId })
        .from(storyTags)
        .where(and(eq(storyTags.storyId, stories.id), inArray(storyTags.tagId, tagIds))),
    ),
  ) as SQL;
  const where = o.includeMature ? listed : (and(listed, eq(stories.isMature, false)) as SQL);
  const [rows, [counts]] = await Promise.all([
    selectStoryCards(db)
      .where(where)
      .orderBy(...recentlyUpdatedOrder)
      .limit(pageSize)
      .offset((o.page - 1) * pageSize),
    // Both counts in one pass: what this reader sees, and what any reader may see.
    db
      .select({
        all: count(),
        general: sql<number>`count(*) filter (where ${stories.isMature} = false)`.mapWith(Number),
      })
      .from(stories)
      .innerJoin(users, eq(users.id, stories.authorId))
      .where(listed),
  ]);
  const all = counts?.all ?? 0;
  return {
    kind: 'ok',
    tag: { slug: tag.slug, name: tag.name, kind: tag.kind },
    stories: {
      items: rows.map(toStoryCard),
      page: o.page,
      totalPages: totalPagesFor(o.includeMature ? all : (counts?.general ?? 0), pageSize),
    },
    lastPage: totalPagesFor(all, pageSize),
  };
}

type MergedTag = { id: string; canonicalId: string | null };

/** The canonical tag id at the end of a merge chain starting at `id`; `null` past the hop limit. */
function followMerges(id: string, merged: readonly MergedTag[]): string | null {
  const next = new Map(merged.map((t) => [t.id, t.canonicalId]));
  let current = id;
  for (let hop = 1; hop < MAX_MERGE_HOPS; hop++) {
    const parent = next.get(current);
    if (!parent) return current;
    current = parent;
  }
  return next.get(current) ? null : current;
}

/** `id` and every tag merged into it, directly or through a chain. */
function mergedInto(id: string, merged: readonly MergedTag[]): string[] {
  const result = new Set([id]);
  for (let grew = true; grew;) {
    grew = false;
    for (const t of merged) {
      if (t.canonicalId && result.has(t.canonicalId) && !result.has(t.id)) {
        result.add(t.id);
        grew = true;
      }
    }
  }
  return [...result];
}
