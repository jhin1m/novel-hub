import { type Db, stories, tags } from '@novel-hub/db';
import { desc, eq, isNull } from 'drizzle-orm';
import { type Result, err, ok } from '../lib/result';
import type { StoryActor } from '../policies/story';
import { type OwnedStoryError, loadOwnedStory } from './load-owned-story';
import {
  type AuthorStoryView,
  type TagView,
  compareTags,
  toAuthorStoryViews,
  toAuthorStoryView,
} from './story-view';

export async function getAuthorStory(
  db: Db,
  actor: StoryActor,
  publicId: string,
): Promise<Result<AuthorStoryView, OwnedStoryError>> {
  const owned = await loadOwnedStory(db, actor, publicId);
  if (!owned.ok) return err(owned.error);
  return ok(await toAuthorStoryView(db, owned.value));
}

/** The actor's own stories, most recently edited first. */
export async function listAuthorStories(db: Db, actor: StoryActor): Promise<AuthorStoryView[]> {
  const rows = await db
    .select()
    .from(stories)
    .where(eq(stories.authorId, actor.id))
    .orderBy(desc(stories.updatedAt));
  return toAuthorStoryViews(db, rows);
}

/** Canonical tags only (merged tags redirect to them), by kind then Vietnamese name order. */
export async function listTags(db: Db): Promise<TagView[]> {
  const rows = await db
    .select({ slug: tags.slug, name: tags.name, kind: tags.kind })
    .from(tags)
    .where(isNull(tags.canonicalId));
  return rows.sort(compareTags);
}
