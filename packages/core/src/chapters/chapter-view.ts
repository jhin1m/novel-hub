import type { chapters } from '@novel-hub/db';
import type { ChapterStatus } from '@novel-hub/shared';

export type ChapterRow = typeof chapters.$inferSelect;

/** A chapter as its author sees it in the writing area. No internal ids. */
export interface AuthorChapterView {
  number: number;
  title: string | null;
  authorNote: string | null;
  status: ChapterStatus;
  wordCount: number;
  publishedAt: string | null;
  scheduledAt: string | null;
  /** Version of the draft (millisecond precision); null when the chapter has no draft yet. */
  draftUpdatedAt: string | null;
  updatedAt: string;
}

export function toAuthorChapterView(
  row: ChapterRow,
  draftUpdatedAt: Date | null,
): AuthorChapterView {
  return {
    number: row.number,
    title: row.title,
    authorNote: row.authorNote,
    status: row.status,
    wordCount: row.wordCount,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    draftUpdatedAt: draftUpdatedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}
