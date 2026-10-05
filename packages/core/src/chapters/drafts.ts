import { type Db, chapterContents, chapterDrafts } from '@novel-hub/db';
import { type EditorDocJson, emptyDraftDoc, parseEditorDoc } from '@novel-hub/shared/editor';
import { and, eq, sql } from 'drizzle-orm';
import { type Result, err, ok } from '../lib/result';
import type { StoryActor } from '../policies/story';
import type { OwnedStoryError } from '../stories/load-owned-story';
import { type AuthorChapterView, toAuthorChapterView } from './chapter-view';
import { draftVersion, nextDraftVersion } from './draft-version';
import { loadOwnedChapter } from './load-owned-chapter';

export interface DraftView {
  chapter: AuthorChapterView;
  doc: EditorDocJson;
  /** Draft version to send back as `baseUpdatedAt` on the next save. */
  updatedAt: string;
}

/**
 * The draft of a chapter for the editor. A chapter without a draft row (published before drafts
 * were kept) gets one seeded from its published content, so saving is always an update.
 */
export async function getDraft(
  db: Db,
  actor: StoryActor,
  publicId: string,
  number: number,
): Promise<Result<DraftView, OwnedStoryError>> {
  const owned = await loadOwnedChapter(db, actor, publicId, number);
  if (!owned.ok) return err(owned.error);
  const { chapter } = owned.value;

  const read = () =>
    db
      .select({ doc: chapterDrafts.docJson, updatedAt: draftVersion })
      .from(chapterDrafts)
      .where(eq(chapterDrafts.chapterId, chapter.id));

  let [draft] = await read();
  if (!draft) {
    const [published] = await db
      .select({ doc: chapterContents.docJson })
      .from(chapterContents)
      .where(eq(chapterContents.chapterId, chapter.id));
    await db
      .insert(chapterDrafts)
      .values({
        chapterId: chapter.id,
        docJson: published?.doc ?? emptyDraftDoc(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing({ target: chapterDrafts.chapterId });
    [draft] = await read();
    if (!draft) throw new Error('Chapter draft was not created');
  }
  return ok({
    chapter: toAuthorChapterView(chapter, draft.updatedAt),
    doc: draft.doc as EditorDocJson,
    updatedAt: draft.updatedAt.toISOString(),
  });
}

export type SaveDraftError = OwnedStoryError | 'INVALID_DOCUMENT' | 'DRAFT_CONFLICT';

/**
 * Autosave. The write only lands when the stored version still equals `baseUpdatedAt` (the version
 * the editor last saw); otherwise another tab or device saved in between → `DRAFT_CONFLICT`. The
 * document is checked against the editor schema first, so drafts in the DB are always valid.
 */
export async function saveDraft(
  db: Db,
  actor: StoryActor,
  publicId: string,
  number: number,
  input: { doc: unknown; baseUpdatedAt: string },
): Promise<Result<{ updatedAt: string }, SaveDraftError>> {
  const owned = await loadOwnedChapter(db, actor, publicId, number);
  if (!owned.ok) return err(owned.error);

  const parsed = parseEditorDoc(input.doc);
  if (!parsed.ok) return err('INVALID_DOCUMENT');

  const base = new Date(input.baseUpdatedAt);
  if (Number.isNaN(base.getTime())) return err('DRAFT_CONFLICT');
  const updatedAt = nextDraftVersion(base);
  const [row] = await db
    .update(chapterDrafts)
    .set({ docJson: parsed.doc, updatedAt })
    .where(
      and(
        eq(chapterDrafts.chapterId, owned.value.chapter.id),
        sql`${draftVersion} = ${base.toISOString()}`,
      ),
    )
    .returning({ chapterId: chapterDrafts.chapterId });
  if (!row) return err('DRAFT_CONFLICT');
  return ok({ updatedAt: updatedAt.toISOString() });
}
