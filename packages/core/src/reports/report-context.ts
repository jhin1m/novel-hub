import { type Db, chapters, stories, users } from '@novel-hub/db';
import type { ChapterStatus, StoryVisibility } from '@novel-hub/shared';
import { eq, inArray } from 'drizzle-orm';
import type { UserRole, UserStatus } from '../policies/user';

/** A story as the moderation queue shows it, by public keys only. */
export interface StoryContext {
  publicId: string;
  slug: string;
  title: string;
  visibility: StoryVisibility;
  author: { username: string; displayName: string; role: UserRole; status: UserStatus };
}

export interface ChapterContext {
  number: number;
  title: string | null;
  status: ChapterStatus;
  /** Soft-deleted by its author. */
  deleted: boolean;
}

export interface UserContext {
  username: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
}

export interface ChapterWithStory {
  story: StoryContext;
  chapter: ChapterContext;
}

const storyColumns = {
  storyPublicId: stories.publicId,
  storySlug: stories.slug,
  storyTitle: stories.title,
  storyVisibility: stories.visibility,
  authorUsername: users.username,
  authorDisplayName: users.displayName,
  authorRole: users.role,
  authorStatus: users.status,
};

interface StoryColumnsRow {
  storyPublicId: string;
  storySlug: string;
  storyTitle: string;
  storyVisibility: StoryVisibility;
  authorUsername: string;
  authorDisplayName: string;
  authorRole: UserRole;
  authorStatus: UserStatus;
}

function toStoryContext(row: StoryColumnsRow): StoryContext {
  return {
    publicId: row.storyPublicId,
    slug: row.storySlug,
    title: row.storyTitle,
    visibility: row.storyVisibility,
    author: {
      username: row.authorUsername,
      displayName: row.authorDisplayName,
      role: row.authorRole,
      status: row.authorStatus,
    },
  };
}

/** Stories by internal id, whatever their visibility (moderators see hidden ones too). */
export async function loadStoryContexts(
  db: Db,
  ids: readonly string[],
): Promise<Map<string, StoryContext>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: stories.id, ...storyColumns })
    .from(stories)
    .innerJoin(users, eq(users.id, stories.authorId))
    .where(inArray(stories.id, [...ids]));
  return new Map(rows.map((row) => [row.id, toStoryContext(row)]));
}

/** Chapters by internal id with their story, deleted and hidden ones included. */
export async function loadChapterContexts(
  db: Db,
  ids: readonly string[],
): Promise<Map<string, ChapterWithStory>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      id: chapters.id,
      number: chapters.number,
      title: chapters.title,
      status: chapters.status,
      deletedAt: chapters.deletedAt,
      ...storyColumns,
    })
    .from(chapters)
    .innerJoin(stories, eq(stories.id, chapters.storyId))
    .innerJoin(users, eq(users.id, stories.authorId))
    .where(inArray(chapters.id, [...ids]));
  return new Map(
    rows.map((row) => [
      row.id,
      {
        story: toStoryContext(row),
        chapter: {
          number: row.number,
          title: row.title,
          status: row.status,
          deleted: row.deletedAt !== null,
        },
      },
    ]),
  );
}

export async function loadUserContexts(
  db: Db,
  ids: readonly string[],
): Promise<Map<string, UserContext>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      status: users.status,
    })
    .from(users)
    .where(inArray(users.id, [...ids]));
  return new Map(rows.map(({ id, ...user }) => [id, user]));
}
