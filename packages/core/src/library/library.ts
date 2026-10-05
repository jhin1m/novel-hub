import { type Db, libraryItems, readingProgress, stories, users } from '@novel-hub/db';
import { LIBRARY_PAGE_SIZE, type LibraryListQuery, type Shelf } from '@novel-hub/shared';
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  type Paged,
  type StoryCardDto,
  publicStoryWhere,
  selectStoryCardsWith,
  toStoryCard,
  totalPagesFor,
} from '../catalog/story-card';
import { type Result, err, ok } from '../lib/result';
import { resumeChapter, resumeScrollPct, savedChapter } from '../reading/continue';

/** A story on one of the reader's shelves, with where they are in it when they started it. */
export interface LibraryItemDto {
  story: StoryCardDto;
  shelf: Shelf;
  addedAt: string;
  progress: { chapterNumber: number; scrollPct: number } | null;
}

/**
 * Lists are the reader's own, so 18+ stories show; stories that are no longer public (hidden,
 * author banned) are left out without touching the rows, so they come back if the story does.
 */
const listedStory = () => publicStoryWhere({ includeMature: true });

/**
 * Puts the story `publicId` on `shelf`, moving it when it already is on another one. Moving keeps
 * the date it was first added. Only public stories can be added.
 */
export async function setShelf(
  db: Db,
  userId: string,
  publicId: string,
  shelf: Shelf,
): Promise<Result<{ shelf: Shelf }, 'NOT_FOUND'>> {
  const [story] = await db
    .select({ id: stories.id })
    .from(stories)
    .innerJoin(users, eq(users.id, stories.authorId))
    .where(and(eq(stories.publicId, publicId), listedStory()))
    .limit(1);
  if (!story) return err('NOT_FOUND');
  await db
    .insert(libraryItems)
    .values({ userId, storyId: story.id, shelf })
    .onConflictDoUpdate({
      target: [libraryItems.userId, libraryItems.storyId],
      set: { shelf: sql`excluded.shelf` },
    });
  return ok({ shelf });
}

/** Takes the story `publicId` off the reader's shelves. Nothing to remove is not an error. */
export async function removeFromLibrary(db: Db, userId: string, publicId: string): Promise<void> {
  await db
    .delete(libraryItems)
    .where(
      and(
        eq(libraryItems.userId, userId),
        inArray(
          libraryItems.storyId,
          db.select({ id: stories.id }).from(stories).where(eq(stories.publicId, publicId)),
        ),
      ),
    );
}

/** The shelf the story `publicId` is on, or `null`. */
export async function getShelf(db: Db, userId: string, publicId: string): Promise<Shelf | null> {
  const [row] = await db
    .select({ shelf: libraryItems.shelf })
    .from(libraryItems)
    .innerJoin(stories, eq(stories.id, libraryItems.storyId))
    .where(and(eq(libraryItems.userId, userId), eq(stories.publicId, publicId)))
    .limit(1);
  return row?.shelf ?? null;
}

/** One shelf, most recently added first, in a single query (cards and reading progress joined). */
export async function listLibrary(
  db: Db,
  userId: string,
  q: LibraryListQuery,
): Promise<Paged<LibraryItemDto>> {
  const onShelf = and(eq(libraryItems.userId, userId), eq(libraryItems.shelf, q.shelf));
  const [total] = await db
    .select({ n: count() })
    .from(libraryItems)
    .innerJoin(stories, eq(stories.id, libraryItems.storyId))
    .innerJoin(users, eq(users.id, stories.authorId))
    .where(and(onShelf, listedStory()));
  const totalPages = totalPagesFor(total?.n ?? 0, LIBRARY_PAGE_SIZE);
  const page = Math.min(q.page, totalPages);

  const resume = resumeChapter(db);
  const rows = await selectStoryCardsWith(db, {
    shelf: libraryItems.shelf,
    addedAt: libraryItems.addedAt,
    savedChapterId: readingProgress.chapterId,
    scrollPct: readingProgress.scrollPct,
    resumeId: resume.id,
    resumeNumber: resume.number,
  })
    .innerJoin(libraryItems, eq(libraryItems.storyId, stories.id))
    .leftJoin(
      readingProgress,
      and(eq(readingProgress.storyId, stories.id), eq(readingProgress.userId, userId)),
    )
    .leftJoin(savedChapter, eq(savedChapter.id, readingProgress.chapterId))
    .leftJoinLateral(resume, sql`true`)
    .where(and(onShelf, listedStory()))
    .orderBy(desc(libraryItems.addedAt), desc(stories.id))
    .limit(LIBRARY_PAGE_SIZE)
    .offset((page - 1) * LIBRARY_PAGE_SIZE);

  return {
    items: rows.map((row) => ({
      story: toStoryCard(row),
      shelf: row.shelf,
      addedAt: row.addedAt.toISOString(),
      progress:
        row.savedChapterId !== null &&
        row.scrollPct !== null &&
        row.resumeId !== null &&
        row.resumeNumber !== null
          ? {
              chapterNumber: row.resumeNumber,
              scrollPct: resumeScrollPct(row.savedChapterId, row.resumeId, row.scrollPct),
            }
          : null,
    })),
    page,
    totalPages,
  };
}
