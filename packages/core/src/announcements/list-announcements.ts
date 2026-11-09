import { type Db, stories, storyAnnouncements, users } from '@novel-hub/db';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { publicStoryWhere } from '../catalog/story-card';
import { type Result, err, ok } from '../lib/result';
import type { StoryActor } from '../policies/story';
import { type AnnouncementDto, findOwnStory, toAnnouncementDto } from './announcement-dto';

/** Visible announcements the author sees on the story's management page. */
const MANAGE_LIST_LIMIT = 20;

/**
 * An announcement on the author page, with the story it is about. No id: the page is cached for
 * everyone and offers no action on it.
 */
export interface AuthorAnnouncementDto extends Omit<AnnouncementDto, 'id'> {
  story: { publicId: string; slug: string; title: string };
}

const newestFirst = [desc(storyAnnouncements.createdAt), desc(storyAnnouncements.id)] as const;

const announcementColumns = {
  id: storyAnnouncements.id,
  body: storyAnnouncements.body,
  createdAt: storyAnnouncements.createdAt,
};

/** The story's visible announcements, newest first. The caller decides the story may be shown. */
export async function listStoryAnnouncements(
  db: Db,
  storyId: string,
  o: { limit: number },
): Promise<AnnouncementDto[]> {
  const rows = await db
    .select(announcementColumns)
    .from(storyAnnouncements)
    .where(and(eq(storyAnnouncements.storyId, storyId), eq(storyAnnouncements.status, 'visible')))
    .orderBy(...newestFirst)
    .limit(o.limit);
  return rows.map(toAnnouncementDto);
}

/** The latest visible announcements of the author's own story, for its management page. */
export async function listManagedAnnouncements(
  db: Db,
  actor: StoryActor,
  publicId: string,
): Promise<Result<AnnouncementDto[], 'NOT_FOUND' | 'FORBIDDEN'>> {
  const own = await findOwnStory(db, actor, publicId);
  if (!own.ok) return err(own.error);
  return ok(await listStoryAnnouncements(db, own.storyId, { limit: MANAGE_LIST_LIMIT }));
}

/**
 * The author's latest visible announcements across their public stories, newest first. 18+
 * stories are left out: the author page HTML is cached for everyone and never shows them.
 */
export async function listAuthorAnnouncements(
  db: Db,
  authorId: string,
  o: { limit: number },
): Promise<AuthorAnnouncementDto[]> {
  const rows = await db
    .select({
      ...announcementColumns,
      publicId: stories.publicId,
      slug: stories.slug,
      title: stories.title,
    })
    .from(storyAnnouncements)
    .innerJoin(stories, eq(stories.id, storyAnnouncements.storyId))
    .innerJoin(users, eq(users.id, stories.authorId))
    .where(
      and(
        eq(stories.authorId, authorId),
        eq(storyAnnouncements.status, 'visible'),
        publicStoryWhere({ includeMature: false }),
        isNotNull(stories.lastChapterAt),
      ),
    )
    .orderBy(...newestFirst)
    .limit(o.limit);
  return rows.map((r) => ({
    body: r.body,
    createdAt: r.createdAt.toISOString(),
    story: { publicId: r.publicId, slug: r.slug, title: r.title },
  }));
}
