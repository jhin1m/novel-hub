import { type Db, type Tx, chapterContents, chapterDrafts, chapterRevisions } from '@novel-hub/db';
import { LIMITS } from '@novel-hub/shared';
import { and, desc, eq, notInArray, sql } from 'drizzle-orm';
import { draftVersion, nextDraftVersion } from '../chapters/draft-version';
import { type PublishedContent, renderPublishedContent } from '../content/render';
import { type Result, err, ok } from '../lib/result';

/** Thrown to roll the whole transaction back when the draft moved under the publish. */
export class DraftConflictError extends Error {
  constructor() {
    super('The draft changed during publishing');
    this.name = 'DraftConflictError';
  }
}

export type RenderDraftError = 'DRAFT_CONFLICT' | 'INVALID_DOCUMENT' | 'WORD_COUNT_OUT_OF_RANGE';

/**
 * Locks the draft row (after the story and chapter, the one lock order everywhere), checks that it
 * is still the version the author published from, and renders it. An autosave from another tab
 * that races this waits on the row lock and then fails its own version check.
 */
export async function lockAndRenderDraft(
  tx: Db | Tx,
  chapterId: string,
  base: Date,
): Promise<Result<PublishedContent, RenderDraftError>> {
  const [draft] = await tx
    .select({ doc: chapterDrafts.docJson, updatedAt: draftVersion })
    .from(chapterDrafts)
    .where(eq(chapterDrafts.chapterId, chapterId))
    .for('update');
  if (!draft || draft.updatedAt.getTime() !== base.getTime()) return err('DRAFT_CONFLICT');
  const rendered = renderPublishedContent(draft.doc);
  if (!rendered.ok) return err(rendered.error);
  const { min, max } = LIMITS.chapterWords;
  if (rendered.value.wordCount < min || rendered.value.wordCount > max) {
    return err('WORD_COUNT_OUT_OF_RANGE');
  }
  return ok(rendered.value);
}

export interface WrittenContent {
  /** False when the stored content already had this exact HTML; nothing was written then. */
  changed: boolean;
  /** Draft version after the write (a new one when pids had to be rewritten). */
  draftUpdatedAt: Date;
  /** The draft as now stored, when it differs from what the editor holds. */
  normalizedDoc: PublishedContent['doc'] | null;
}

/**
 * Stores rendered content: upserts `chapter_contents`, records a revision (keeping the newest
 * `LIMITS.revisionsKept`) and, when pids were added or replaced, writes the normalized document
 * back to the draft so later edits keep the same paragraph ids. The draft and the revision share
 * one timestamp, which is what "unpublished changes" compares against.
 */
export async function writeChapterContent(
  tx: Db | Tx,
  chapterId: string,
  base: Date,
  content: PublishedContent,
  now: Date,
): Promise<WrittenContent> {
  const [current] = await tx
    .select({ contentHash: chapterContents.contentHash })
    .from(chapterContents)
    .where(eq(chapterContents.chapterId, chapterId));
  if (current?.contentHash === content.contentHash) {
    return { changed: false, draftUpdatedAt: base, normalizedDoc: null };
  }

  const stored = {
    docJson: content.doc,
    html: content.html,
    paragraphIds: content.paragraphIds,
    contentHash: content.contentHash,
  };
  await tx
    .insert(chapterContents)
    .values({ chapterId, ...stored })
    .onConflictDoUpdate({ target: chapterContents.chapterId, set: stored });

  const version = nextDraftVersion(base, now);
  if (content.pidsChanged) {
    const [row] = await tx
      .update(chapterDrafts)
      .set({ docJson: content.doc, updatedAt: version })
      .where(
        and(eq(chapterDrafts.chapterId, chapterId), sql`${draftVersion} = ${base.toISOString()}`),
      )
      .returning({ chapterId: chapterDrafts.chapterId });
    if (!row) throw new DraftConflictError();
  }

  await tx
    .insert(chapterRevisions)
    .values({ chapterId, docJson: content.doc, wordCount: content.wordCount, createdAt: version });
  const kept = tx
    .select({ id: chapterRevisions.id })
    .from(chapterRevisions)
    .where(eq(chapterRevisions.chapterId, chapterId))
    .orderBy(desc(chapterRevisions.createdAt), desc(chapterRevisions.id))
    .limit(LIMITS.revisionsKept);
  await tx
    .delete(chapterRevisions)
    .where(and(eq(chapterRevisions.chapterId, chapterId), notInArray(chapterRevisions.id, kept)));

  return content.pidsChanged
    ? { changed: true, draftUpdatedAt: version, normalizedDoc: content.doc }
    : { changed: true, draftUpdatedAt: base, normalizedDoc: null };
}
