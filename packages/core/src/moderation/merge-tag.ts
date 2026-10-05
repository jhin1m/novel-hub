import { type Tx, stories, storyTags, tags } from '@novel-hub/db';
import { asc, eq, inArray, or, sql } from 'drizzle-orm';
import { type ContentChange } from '../content/hooks';
import { recordContentChanges } from '../content/outbox';
import { type Result, err, ok } from '../lib/result';
import type { CurrentUser } from '../users/current-user';
import { type ModerationError, type ModerationTarget, logModerationAction } from './log-action';

/** Cap of `previousTagSlugs` in a content change (its schema limit). */
const MAX_PREVIOUS_SLUGS = 50;

/**
 * Merges tag `sourceSlug` into `targetSlug` (same kind; the target must itself be canonical). Every
 * story on the source, or on a tag already merged into it, moves to the target (duplicates dropped,
 * main tag included), and the chain is flattened: the source and every tag that pointed at it now
 * point straight at the target, so a merged slug always redirects in one step. Both tags are
 * locked in id order, then the affected stories. Each affected story gets an outbox event naming the old tag slugs, so their
 * cached tag pages are purged and their search documents resynced.
 */
export async function mergeTag(
  tx: Tx,
  actor: CurrentUser,
  sourceSlug: string,
  targetSlug: string,
  note: string | undefined,
): Promise<Result<ModerationTarget, ModerationError>> {
  if (sourceSlug === targetSlug) return err('INVALID_STATE');
  const locked = await tx
    .select({ id: tags.id, slug: tags.slug, kind: tags.kind, canonicalId: tags.canonicalId })
    .from(tags)
    .where(inArray(tags.slug, [sourceSlug, targetSlug]))
    .orderBy(asc(tags.id))
    // `no key update`, not `update`: a story edit holding its story lock checks the `story_tags`
    // foreign key with a key-share lock on the tag, which `update` would block (lock cycle).
    .for('no key update');
  const source = locked.find((t) => t.slug === sourceSlug);
  const target = locked.find((t) => t.slug === targetSlug);
  if (!source || !target) return err('NOT_FOUND');
  if (source.kind !== target.kind || source.canonicalId !== null || target.canonicalId !== null) {
    return err('INVALID_STATE');
  }

  const merged = await tx
    .select({ id: tags.id, slug: tags.slug })
    .from(tags)
    .where(eq(tags.canonicalId, source.id));
  const oldIds = [source.id, ...merged.map((t) => t.id)];
  const previousTagSlugs = [source.slug, ...merged.map((t) => t.slug)].slice(0, MAX_PREVIOUS_SLUGS);

  const affected = await tx
    .selectDistinct({ id: stories.id })
    .from(stories)
    .leftJoin(storyTags, eq(storyTags.storyId, stories.id))
    .where(or(inArray(stories.mainTagId, oldIds), inArray(storyTags.tagId, oldIds)));
  if (affected.length > 0) {
    // Story locks before any write, in id order: concurrent story edits finish first (or wait).
    await tx
      .select({ id: stories.id })
      .from(stories)
      .where(
        inArray(
          stories.id,
          affected.map((story) => story.id),
        ),
      )
      .orderBy(asc(stories.id))
      .for('update');
    await tx.execute(sql`
      insert into story_tags (story_id, tag_id)
      select distinct story_id, ${target.id}::uuid from story_tags
      where tag_id in (${sql.join(
        oldIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
      on conflict do nothing`);
    await tx.delete(storyTags).where(inArray(storyTags.tagId, oldIds));
    await tx
      .update(stories)
      .set({ mainTagId: target.id })
      .where(inArray(stories.mainTagId, oldIds));
  }
  await tx.update(tags).set({ canonicalId: target.id }).where(inArray(tags.id, oldIds));

  const logTarget: ModerationTarget = { type: 'tag', id: source.id };
  await logModerationAction(tx, actor, logTarget, 'merge_tag', note);
  await recordContentChanges(
    tx,
    affected.map((story): ContentChange => ({
      entity: 'story',
      action: 'updated',
      storyId: story.id,
      previousTagSlugs,
    })),
  );
  return ok(logTarget);
}
