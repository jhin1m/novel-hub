import { type Db, type Tx, chapterContents, chapterDrafts, chapterRevisions } from '@novel-hub/db';
import { type ChapterStatus, LIMITS, countWords, docToText } from '@novel-hub/shared';
import { type EditorDocJson, parseEditorDoc } from '@novel-hub/shared/editor';
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { nextDraftVersion } from '../chapters/draft-version';
import { type SaveDraftError, differsFromStoredContent, saveDraft } from '../chapters/drafts';
import { loadOwnedChapter } from '../chapters/load-owned-chapter';
import { renderChapterHtml } from '../content/render';
import { type Result, err, ok } from '../lib/result';
import { recordRevision } from '../publishing/write-content';
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
 * Position (newest first) of the revision readers currently see: the newest one whose document
 * equals the stored content. Not simply the newest revision, because a restore also keeps the
 * replaced draft as one. -1 unless the chapter is published.
 */
export function publishedRevisionIndex(
  matchesContent: readonly boolean[],
  status: ChapterStatus,
): number {
  return status === 'published' ? matchesContent.indexOf(true) : -1;
}

/**
 * The revision behind a key. `created_at` keeps microseconds while the key has milliseconds, so the
 * lookup is a one-millisecond range (served by the `(chapter_id, created_at)` index); publishing
 * locks the chapter, so two revisions in the same millisecond are not expected, and the newest
 * wins if they ever occur.
 */
async function findRevision(db: Db | Tx, chapterId: string, key: string) {
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
    .select({
      createdAt: chapterRevisions.createdAt,
      wordCount: chapterRevisions.wordCount,
      matchesContent: sql<boolean>`coalesce(${chapterRevisions.docJson} = ${chapterContents.docJson}, false)`,
    })
    .from(chapterRevisions)
    .leftJoin(chapterContents, eq(chapterContents.chapterId, chapterRevisions.chapterId))
    .where(eq(chapterRevisions.chapterId, chapter.id))
    .orderBy(desc(chapterRevisions.createdAt), desc(chapterRevisions.id))
    .limit(LIMITS.revisionsKept);
  const published = publishedRevisionIndex(
    rows.map((row) => row.matchesContent),
    chapter.status,
  );
  return ok(
    rows.map((row, index) => ({
      key: revisionKey(row.createdAt),
      createdAt: row.createdAt.toISOString(),
      wordCount: row.wordCount,
      isPublished: index === published,
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

/** Aborts the restore transaction with the error `saveDraft` reported. */
class RestoreAborted extends Error {
  constructor(readonly reason: SaveDraftError) {
    super(`Restore aborted: ${reason}`);
    this.name = 'RestoreAborted';
  }
}

/**
 * Keeps the current draft as a revision unless it equals the newest one (compared as jsonb, so key
 * order does not matter). Without this the draft would be gone: the browser copy is cleared after
 * every successful autosave. The snapshot counts towards `LIMITS.revisionsKept` like any revision.
 */
async function snapshotDraft(tx: Tx, chapterId: string): Promise<void> {
  const [draft] = await tx
    .select({ doc: chapterDrafts.docJson })
    .from(chapterDrafts)
    .where(eq(chapterDrafts.chapterId, chapterId))
    .for('update');
  if (!draft) return;
  const [latest] = await tx
    .select({
      createdAt: chapterRevisions.createdAt,
      same: sql<boolean>`${chapterRevisions.docJson} = ${chapterDrafts.docJson}`,
    })
    .from(chapterRevisions)
    .innerJoin(chapterDrafts, eq(chapterDrafts.chapterId, chapterRevisions.chapterId))
    .where(eq(chapterRevisions.chapterId, chapterId))
    .orderBy(desc(chapterRevisions.createdAt), desc(chapterRevisions.id))
    .limit(1);
  if (latest?.same) return;
  await recordRevision(tx, {
    chapterId,
    docJson: draft.doc,
    wordCount: countWords(docToText(draft.doc as EditorDocJson)),
    // A key of its own: revisions are addressed by their creation millisecond.
    createdAt: nextDraftVersion(latest?.createdAt ?? null),
  });
}

/**
 * Copies a revision into the draft through `saveDraft`, so it is guarded by the same version check
 * as autosave (`DRAFT_CONFLICT`) and never touches the published content. The draft it replaces is
 * kept as a revision first (see `snapshotDraft`); one transaction under the story → chapter → draft
 * locks, so a refused restore leaves no snapshot behind. Paragraph ids are kept, so republishing
 * leaves anchors on them intact.
 */
export async function restoreRevision(
  db: Db,
  actor: StoryActor,
  publicId: string,
  number: number,
  key: string,
  baseUpdatedAt: string,
): Promise<Result<RestoredDraft, SaveDraftError>> {
  let restored: Result<
    { chapterId: string; doc: EditorDocJson; updatedAt: string },
    SaveDraftError
  >;
  try {
    restored = await db.transaction(async (tx) => {
      const owned = await loadOwnedChapter(tx, actor, publicId, number, { forUpdate: true });
      if (!owned.ok) return err(owned.error);
      const chapterId = owned.value.chapter.id;
      const revision = await findRevision(tx, chapterId, key);
      if (!revision) return err('NOT_FOUND');
      // Revisions written before a schema change could fail the editor schema; report, do not store.
      const parsed = parseEditorDoc(revision.docJson);
      if (!parsed.ok) return err('INVALID_DOCUMENT');
      await snapshotDraft(tx, chapterId);
      const saved = await saveDraft(tx, actor, publicId, number, {
        doc: parsed.doc,
        baseUpdatedAt,
      });
      if (!saved.ok) throw new RestoreAborted(saved.error);
      return ok({ chapterId, doc: parsed.doc, updatedAt: saved.value.updatedAt });
    });
  } catch (error) {
    if (error instanceof RestoreAborted) return err(error.reason);
    throw error;
  }
  if (!restored.ok) return restored;
  return ok({
    doc: restored.value.doc,
    updatedAt: restored.value.updatedAt,
    hasUnpublishedChanges: await differsFromStoredContent(
      db,
      restored.value.chapterId,
      restored.value.doc,
    ),
  });
}
