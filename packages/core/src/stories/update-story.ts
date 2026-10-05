import { type Db, type NewStory, stories, storyTags } from '@novel-hub/db';
import { type StoryUpdateInput, slugify } from '@novel-hub/shared';
import { eq } from 'drizzle-orm';
import { type Result, err, ok } from '../lib/result';
import type { StoryActor } from '../policies/story';
import { type OwnedStoryError, loadOwnedStory } from './load-owned-story';
import { type TagError, resolveTags } from './resolve-tags';
import { type AuthorStoryView, toAuthorStoryView } from './story-view';

export interface UpdatedStory {
  story: AuthorStoryView;
  /** Slug before a title change (old URLs must be purged), `null` when the slug kept its value. */
  previousSlug: string | null;
}

/**
 * Edits story metadata. A new title regenerates the slug; `publicId` never changes. Tags are
 * replaced as a whole set. Authors cannot touch `visibility` or `slug` directly.
 */
export async function updateStory(
  db: Db,
  actor: StoryActor,
  publicId: string,
  input: StoryUpdateInput,
): Promise<Result<UpdatedStory, OwnedStoryError | TagError>> {
  return db.transaction(async (tx) => {
    const owned = await loadOwnedStory(tx, actor, publicId, { forUpdate: true });
    if (!owned.ok) return err(owned.error);
    const current = owned.value;

    const changes: Partial<NewStory> = {
      synopsis: input.synopsis,
      isMature: input.isMature,
      isAiAssisted: input.isAiAssisted,
      status: input.status,
    };
    if (input.title !== undefined) {
      changes.title = input.title;
      changes.slug = slugify(input.title);
    }
    if (input.mainTag !== undefined) {
      const resolved = await resolveTags(tx, input.mainTag, input.tags ?? []);
      if (!resolved.ok) return err(resolved.error);
      changes.mainTagId = resolved.value.mainTagId;
      await tx.delete(storyTags).where(eq(storyTags.storyId, current.id));
      await tx
        .insert(storyTags)
        .values(resolved.value.tagIds.map((tagId) => ({ storyId: current.id, tagId })));
    }

    // `updated_at` is bumped by the column's `$onUpdate` even when only tags changed.
    const [row] = await tx
      .update(stories)
      .set(changes)
      .where(eq(stories.id, current.id))
      .returning();
    if (!row) throw new Error('Updated story not found');
    return ok({
      story: await toAuthorStoryView(tx, row),
      previousSlug: row.slug === current.slug ? null : current.slug,
    });
  });
}
