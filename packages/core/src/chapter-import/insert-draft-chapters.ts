import { type Tx, chapterDrafts, chapters } from '@novel-hub/db';
import type { EditorDocJson } from '@novel-hub/shared/editor';
import { eq, max } from 'drizzle-orm';

export interface DraftChapterInput {
  title: string | null;
  /** Already checked against the editor schema. */
  doc: EditorDocJson;
}

export interface InsertedDraftChapter {
  number: number;
  /** Draft version to hand to publish or schedule as `baseUpdatedAt`. */
  draftUpdatedAt: Date;
}

/**
 * Inserts chapters with their drafts, numbered right after the story's last chapter (soft-deleted
 * ones included, as in `createChapter`). The caller holds the story row lock, so the numbers are
 * consecutive and no other create or import can take one in between.
 */
export async function insertDraftChapters(
  tx: Tx,
  storyId: string,
  items: readonly DraftChapterInput[],
): Promise<InsertedDraftChapter[]> {
  const [last] = await tx
    .select({ number: max(chapters.number) })
    .from(chapters)
    .where(eq(chapters.storyId, storyId));
  const first = (last?.number ?? 0) + 1;
  const rows = await tx
    .insert(chapters)
    .values(items.map((item, i) => ({ storyId, number: first + i, title: item.title })))
    .returning({ id: chapters.id, number: chapters.number });

  // Set by the app (milliseconds) so the version handed on matches the stored one.
  const draftUpdatedAt = new Date();
  const byNumber = new Map(rows.map((row) => [row.number, row.id]));
  await tx.insert(chapterDrafts).values(
    items.map((item, i) => {
      const chapterId = byNumber.get(first + i);
      if (!chapterId) throw new Error('Imported chapter row is missing');
      return { chapterId, docJson: item.doc, updatedAt: draftUpdatedAt };
    }),
  );
  return items.map((_, i) => ({ number: first + i, draftUpdatedAt }));
}
