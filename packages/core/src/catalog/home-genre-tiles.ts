import { type Db, stories, tags, users } from '@novel-hub/db';
import {
  HOME_GENRE_TILE_COVERS,
  HOME_GENRE_TILE_SLUGS,
  type HomeGenreTileSlug,
} from '@novel-hub/shared';
import { and, asc, eq, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { publicStoryWhere, recentlyUpdatedOrder } from './story-card';

/** One "what to read today" tile on the home page, a way into a genre's tag page. */
export interface HomeGenreTile {
  slug: HomeGenreTileSlug;
  name: string;
  /** Newest first, at most `HOME_GENRE_TILE_COVERS`; the first is the backdrop. */
  coverUrls: string[];
}

const mainTag = alias(tags, 'main_tag');

/**
 * The home page's genre tiles, in display order; a tag missing from the database has no tile.
 * Goes into the publicly cached HTML, so no 18+ story can ever provide a cover here. A story under
 * a merged tag counts for the canonical genre. Two queries however many genres there are.
 */
export async function listHomeGenreTiles(db: Db): Promise<HomeGenreTile[]> {
  const genres = await db
    .select({ id: tags.id, slug: tags.slug, name: tags.name })
    .from(tags)
    .where(
      and(
        inArray(tags.slug, [...HOME_GENRE_TILE_SLUGS]),
        eq(tags.kind, 'genre'),
        isNull(tags.canonicalId),
      ),
    );
  if (genres.length === 0) return [];

  const genreId = sql<string>`coalesce(${mainTag.canonicalId}, ${mainTag.id})`;
  const ranked = db
    .select({
      genreId: genreId.as('genre_id'),
      coverUrl: sql<string>`${stories.coverUrl}`.as('tile_cover_url'),
      rank: sql<number>`row_number() over (
        partition by ${genreId}
        order by ${sql.join([...recentlyUpdatedOrder], sql`, `)}
      )`.as('cover_rank'),
    })
    .from(stories)
    .innerJoin(users, eq(users.id, stories.authorId))
    .innerJoin(mainTag, eq(mainTag.id, stories.mainTagId))
    .where(
      and(
        publicStoryWhere({ includeMature: false }),
        isNotNull(stories.coverUrl),
        inArray(
          genreId,
          genres.map((genre) => genre.id),
        ),
      ),
    )
    .as('ranked_covers');
  const covers = await db
    .select({ genreId: ranked.genreId, coverUrl: ranked.coverUrl })
    .from(ranked)
    .where(lte(ranked.rank, HOME_GENRE_TILE_COVERS))
    .orderBy(asc(ranked.rank));

  return HOME_GENRE_TILE_SLUGS.flatMap((slug) => {
    const genre = genres.find((candidate) => candidate.slug === slug);
    if (!genre) return [];
    const coverUrls = covers.filter((c) => c.genreId === genre.id).map((c) => c.coverUrl);
    return [{ slug, name: genre.name, coverUrls }];
  });
}
