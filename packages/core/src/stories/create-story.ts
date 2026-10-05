import { type Db, insertStoryWithPublicId, stories, storyTags, users } from '@novel-hub/db';
import { type StoryCreateInput, slugify } from '@novel-hub/shared';
import { and, eq } from 'drizzle-orm';
import { type Result, err, ok } from '../lib/result';
import type { StoryActor } from '../policies/story';
import { type TagError, resolveTags } from './resolve-tags';
import { type AuthorStoryView, toAuthorStoryView } from './story-view';

/**
 * Creates a draft story. Its first story turns a reader into an author in the same transaction;
 * mods and admins keep their role. Better Auth has no cookie cache here, so the next request
 * already sees the new role.
 */
export async function createStory(
  db: Db,
  actor: StoryActor,
  input: StoryCreateInput,
): Promise<Result<AuthorStoryView, TagError>> {
  return db.transaction(async (tx) => {
    const resolved = await resolveTags(tx, input.mainTag, input.tags);
    if (!resolved.ok) return err(resolved.error);

    const { id } = await insertStoryWithPublicId(tx, {
      slug: slugify(input.title),
      authorId: actor.id,
      title: input.title,
      synopsis: input.synopsis,
      mainTagId: resolved.value.mainTagId,
      isMature: input.isMature,
      isAiAssisted: input.isAiAssisted,
    });
    await tx
      .insert(storyTags)
      .values(resolved.value.tagIds.map((tagId) => ({ storyId: id, tagId })));
    await tx
      .update(users)
      .set({ role: 'author' })
      .where(and(eq(users.id, actor.id), eq(users.role, 'reader')));

    const [row] = await tx.select().from(stories).where(eq(stories.id, id));
    if (!row) throw new Error('Created story not found');
    return ok(await toAuthorStoryView(tx, row));
  });
}
