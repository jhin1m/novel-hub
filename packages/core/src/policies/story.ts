import { isBanned } from './user';
import type { PolicyUser } from './user';

/** The acting user as story services need it; `id` stays internal. */
export interface StoryActor extends PolicyUser {
  id: string;
}

/** Only the author edits a story; banned users are already guests at the session layer. */
export function canEditStory(user: StoryActor, story: { authorId: string }): boolean {
  return !isBanned(user) && user.id === story.authorId;
}

/** Chapters belong to their story: whoever edits the story edits its chapters. */
export function canEditChapter(user: StoryActor, story: { authorId: string }): boolean {
  return canEditStory(user, story);
}
