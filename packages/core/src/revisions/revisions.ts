import { type Db, chapterRevisions } from '@novel-hub/db';
import { type ChapterStatus, LIMITS } from '@novel-hub/shared';
import { type EditorDocJson, parseEditorDoc } from '@novel-hub/shared/editor';
import { and, desc, eq, gte, lt } from 'drizzle-orm';
import { type SaveDraftError, differsFromStoredContent, saveDraft } from '../chapters/drafts';
import { loadOwnedChapter } from '../chapters/load-owned-chapter';
import { renderChapterHtml } from '../content/render';
import { type Result, err, ok } from '../lib/result';
import type { StoryActor } from '../policies/story';
import type { OwnedStoryError } from '../stories/load-owned-story';

export interface RevisionSummary {
  /** Creation time in epoch milliseconds; the only handle on a revision outside the server. */
  key: string;
  createdAt: string;
  wordCount: number;
  /** This revision is what readers currently see. */
  isPublished: boolean;
}

export interface RevisionPreview {
  key: string;
  createdAt: string;
  wordCount: number;
  /** Sanitized HTML rendered on the server; the revision keeps its own paragraph ids. */
  html: string;
}

export interface RestoredDraft {
  doc: EditorDocJson;
  /** Draft version to continue autosaving from. */
  updatedAt: string;
  /** Same meaning as in the editor's draft view. */
  hasUnpublishedChanges: boolean;
}

export function revisionKey(createdAt: Date): string {
  return String(createdAt.getTime());
}

/**
 * Revisions are only written when a publish changes the content, so the newest one is the
 * published content as long as the chapter is published.
 */
export function isPublishedRevision(index: number, status: ChapterStatus): boolean {
  return index === 0 && status === 'published';
}

/**
 * The revision behind a key. `created_at` keeps microseconds while the key has milliseconds, so the
 * lookup is a one-millisecond range (served by the `(chapter_id, created_at)` index); publishing
 * locks the chapter, so two revisions in the same millisecond are not expected, and the newest
 * wins if they ever occur.
 */
async function findRevision(db: Db, chapterId: string, key: string) {
  const from = new Date(Number(key));
  if (Number.isNaN(from.getTime())) return null;
  const [row] = await db
    .select({
      docJson: chapterRevisions.docJson,
      wordCount: chapterRevisions.wordCount,
      createdAt: chapterRevisions.createdAt,
    })
    .from(chapterRevisions)
    .where(
      and(
        eq(chapterRevisions.chapterId, chapterId),
        gte(chapterRevisions.createdAt, from),
        lt(chapterRevisions.createdAt, new Date(from.getTime() + 1)),
      ),
    )
    .orderBy(desc(chapterRevisions.createdAt), desc(chapterRevisions.id))
    .limit(1);
  return row ?? null;
}

/** Revisions of a chapter, newest first, without their documents. */
export async function listRevisions(
  db: Db,
  actor: StoryActor,
  publicId: string,
  number: number,
): Promise<Result<RevisionSummary[], OwnedStoryError>> {
  const owned = await loadOwnedChapter(db, actor, publicId, number);
  if (!owned.ok) return err(owned.error);
  const { chapter } = owned.value;
  const rows = await db
    .select({ createdAt: chapterRevisions.createdAt, wordCount: chapterRevisions.wordCount })
    .from(chapterRevisions)
    .where(eq(chapterRevisions.chapterId, chapter.id))
    .orderBy(desc(chapterRevisions.createdAt), desc(chapterRevisions.id))
    .limit(LIMITS.revisionsKept);
  return ok(
    rows.map((row, index) => ({
      key: revisionKey(row.createdAt),
      createdAt: row.createdAt.toISOString(),
      wordCount: row.wordCount,
      isPublished: isPublishedRevision(index, chapter.status),
    })),
  );
}

/**
 * A revision rendered for preview. Owner only like the editor: a revision may hold text the
 * author has since taken down.
 */
export async function getRevisionPreview(
  db: Db,
  actor: StoryActor,
  publicId: string,
  number: number,
  key: string,
): Promise<Result<RevisionPreview, OwnedStoryError>> {
  const owned = await loadOwnedChapter(db, actor, publicId, number);
  if (!owned.ok) return err(owned.error);
  const revision = await findRevision(db, owned.value.chapter.id, key);
  if (!revision) return err('NOT_FOUND');
  return ok({
    key: revisionKey(revision.createdAt),
    createdAt: revision.createdAt.toISOString(),
    wordCount: revision.wordCount,
    html: renderChapterHtml(revision.docJson as EditorDocJson),
  });
}

/**
 * Copies a revision into the draft through `saveDraft`, so it is guarded by the same version check
 * as autosave (`DRAFT_CONFLICT`) and never touches the published content. Paragraph ids are kept,
 * so republishing leaves anchors on them intact.
 */
export async function restoreRevision(
  db: Db,
  actor: StoryActor,
  publicId: string,
  number: number,
  key: string,
  baseUpdatedAt: string,
): Promise<Result<RestoredDraft, SaveDraftError>> {
  const owned = await loadOwnedChapter(db, actor, publicId, number);
  if (!owned.ok) return err(owned.error);
  const revision = await findRevision(db, owned.value.chapter.id, key);
  if (!revision) return err('NOT_FOUND');
  // Revisions written before a schema change could fail the editor schema; report, do not store.
  const parsed = parseEditorDoc(revision.docJson);
  if (!parsed.ok) return err('INVALID_DOCUMENT');
  const saved = await saveDraft(db, actor, publicId, number, { doc: parsed.doc, baseUpdatedAt });
  if (!saved.ok) return err(saved.error);
  return ok({
    doc: parsed.doc,
    updatedAt: saved.value.updatedAt,
    hasUnpublishedChanges: await differsFromStoredContent(db, owned.value.chapter.id, parsed.doc),
  });
}
