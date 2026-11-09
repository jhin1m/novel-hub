import { type Db, stories, storyAnnouncements, users } from '@novel-hub/db';
import type { AnnouncementStatus } from '@novel-hub/shared';
import { eq, inArray } from 'drizzle-orm';
import {
  COMMENT_EXCERPT_MAX,
  type StoryContext,
  storyColumns,
  toStoryContext,
} from './report-context';

/** A reported author announcement: the start of its text and its state. Its author is the story's. */
export interface AnnouncementContext {
  /** For the hide/restore actions: an announcement has no public key. Never shown. */
  id: string;
  excerpt: string;
  /** Longer than the excerpt. */
  truncated: boolean;
  status: AnnouncementStatus;
  createdAt: string;
}

export interface AnnouncementWithStory {
  story: StoryContext;
  announcement: AnnouncementContext;
}

/** Announcements by internal id with their story, whatever their state. */
export async function loadAnnouncementContexts(
  db: Db,
  ids: readonly string[],
): Promise<Map<string, AnnouncementWithStory>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      id: storyAnnouncements.id,
      body: storyAnnouncements.body,
      status: storyAnnouncements.status,
      createdAt: storyAnnouncements.createdAt,
      ...storyColumns,
    })
    .from(storyAnnouncements)
    .innerJoin(stories, eq(stories.id, storyAnnouncements.storyId))
    .innerJoin(users, eq(users.id, stories.authorId))
    .where(inArray(storyAnnouncements.id, [...ids]));
  return new Map(
    rows.map((row) => {
      const chars = [...row.body];
      return [
        row.id,
        {
          story: toStoryContext(row),
          announcement: {
            id: row.id,
            excerpt: chars.slice(0, COMMENT_EXCERPT_MAX).join(''),
            truncated: chars.length > COMMENT_EXCERPT_MAX,
            status: row.status as AnnouncementStatus,
            createdAt: row.createdAt.toISOString(),
          },
        },
      ];
    }),
  );
}
