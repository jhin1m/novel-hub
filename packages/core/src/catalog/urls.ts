import {
  type Db,
  type Tx,
  contestEntries,
  contests,
  stories,
  storyTags,
  tags,
  users,
} from '@novel-hub/db';
import { RANKING_PERIODS, canonicalPath } from '@novel-hub/shared';
import { eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { ContentChange } from '../content/hooks';

const canonical = alias(tags, 'canonical');

/**
 * Canonical paths of the cached list pages a change may have altered: the home page, the author
 * page, page 1 of every tag page the story appears on and every ranking page (cheap: four URLs, and
 * a hidden story must leave them before the next recompute), plus the contest pages the stories
 * entered. Later tag pages are left to their short TTL. Read from the current state without any visibility filter, so a story that was just hidden,
 * or an author who was just banned, still yields the lists they must disappear from.
 */
export async function catalogUrls(db: Db, change: ContentChange): Promise<string[]> {
  switch (change.entity) {
    case 'story':
    case 'chapter': {
      const [story] = await db
        .select({ username: users.username })
        .from(stories)
        .innerJoin(users, eq(users.id, stories.authorId))
        .where(eq(stories.id, change.storyId))
        .limit(1);
      if (!story) return [];
      const slugs = await storyTagSlugs(db, [change.storyId]);
      if (change.entity === 'story') slugs.push(...(change.previousTagSlugs ?? []));
      return [
        canonicalPath({ kind: 'home' }),
        canonicalPath({ kind: 'author', username: story.username }),
        ...tagPaths(slugs),
        ...rankingPaths(),
        ...(await contestPaths(db, [change.storyId])),
      ];
    }
    case 'user': {
      // The author page itself is already among the author's URLs.
      const owned = await db
        .select({ id: stories.id })
        .from(stories)
        .where(eq(stories.authorId, change.userId));
      if (owned.length === 0) return [];
      return [
        canonicalPath({ kind: 'home' }),
        ...tagPaths(
          await storyTagSlugs(
            db,
            owned.map((s) => s.id),
          ),
        ),
        ...rankingPaths(),
        ...(await contestPaths(
          db,
          owned.map((s) => s.id),
        )),
      ];
    }
    default: {
      const unhandled: never = change;
      throw new Error(`Unhandled content change ${JSON.stringify(unhandled)}`);
    }
  }
}

/** Canonical slugs of every tag linked to the stories (a merged tag counts as its canonical tag). */
export async function storyTagSlugs(db: Db | Tx, storyIds: string[]): Promise<string[]> {
  const rows = await db
    .selectDistinct({ slug: sql<string>`coalesce(${canonical.slug}, ${tags.slug})` })
    .from(storyTags)
    .innerJoin(tags, eq(tags.id, storyTags.tagId))
    .leftJoin(canonical, eq(canonical.id, tags.canonicalId))
    .where(inArray(storyTags.storyId, storyIds));
  return rows.map((r) => r.slug);
}

/** Page 1 of each tag page, deduplicated and sorted. */
function tagPaths(slugs: string[]): string[] {
  return [...new Set(slugs)].sort().map((slug) => canonicalPath({ kind: 'tag', slug }));
}

/**
 * `/contests` (its entry counts) and page 1 of every contest the stories entered, ended ones
 * included (their winners show); none when they entered no contest.
 */
async function contestPaths(db: Db, storyIds: string[]): Promise<string[]> {
  const rows = await db
    .selectDistinct({ slug: contests.slug })
    .from(contestEntries)
    .innerJoin(contests, eq(contests.id, contestEntries.contestId))
    .where(inArray(contestEntries.storyId, storyIds));
  if (rows.length === 0) return [];
  return [
    canonicalPath({ kind: 'contests' }),
    ...rows
      .map((r) => r.slug)
      .sort()
      .map((slug) => canonicalPath({ kind: 'contest', slug })),
  ];
}

/** Every ranking page. */
function rankingPaths(): string[] {
  return RANKING_PERIODS.map((period) => canonicalPath({ kind: 'ranking', period }));
}
