import { type Db, type Tx, tags } from '@novel-hub/db';
import { LIMITS } from '@novel-hub/shared';
import { inArray } from 'drizzle-orm';
import { type Result, err, ok } from '../lib/result';

export type TagError = 'UNKNOWN_TAG' | 'MAIN_TAG_NOT_GENRE' | 'TOO_MANY_TAGS';

export interface ResolvedTags {
  mainTagId: string;
  /** Every tag of the story, main tag included, without duplicates. */
  tagIds: string[];
}

/**
 * Turns submitted tag slugs into canonical tag ids: a merged tag counts as its canonical tag, and
 * duplicates after that mapping count once. The main tag must be a genre once resolved.
 */
export async function resolveTags(
  db: Db | Tx,
  mainSlug: string,
  extraSlugs: readonly string[],
): Promise<Result<ResolvedTags, TagError>> {
  const slugs = [...new Set([mainSlug, ...extraSlugs])];
  const found = await db
    .select({ id: tags.id, slug: tags.slug, kind: tags.kind, canonicalId: tags.canonicalId })
    .from(tags)
    .where(inArray(tags.slug, slugs));
  if (found.length !== slugs.length) return err('UNKNOWN_TAG');

  const canonicalIdOf = new Map(found.map((t) => [t.slug, t.canonicalId ?? t.id]));
  const pending = [...new Set(found.flatMap((t) => (t.canonicalId ? [t.canonicalId] : [])))];
  const canonicalRows =
    pending.length === 0
      ? []
      : await db
          .select({ id: tags.id, kind: tags.kind })
          .from(tags)
          .where(inArray(tags.id, pending));
  const kindById = new Map([...found, ...canonicalRows].map((t) => [t.id, t.kind]));

  const mainTagId = canonicalIdOf.get(mainSlug);
  if (mainTagId === undefined) return err('UNKNOWN_TAG');
  if (kindById.get(mainTagId) !== 'genre') return err('MAIN_TAG_NOT_GENRE');

  const tagIds = [...new Set(found.map((t) => t.canonicalId ?? t.id))];
  if (tagIds.length > LIMITS.storyTagsMax) return err('TOO_MANY_TAGS');
  return ok({ mainTagId, tagIds });
}
