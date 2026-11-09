import type { Db } from '@novel-hub/db';
import type { ChapterImportInput } from '@novel-hub/shared';
import { type Result, err, ok } from '../lib/result';
import { canUseTrustedFeature } from '../policies/account-age';
import { type StoryActor, canEditChapter } from '../policies/story';
import { publishChapter } from '../publishing/publish-chapter';
import { scheduleChapter } from '../publishing/schedule-chapter';
import { type OwnedStoryError, loadOwnedStory } from '../stories/load-owned-story';
import { insertDraftChapters } from './insert-draft-chapters';
import { prepareImport } from './prepare-import';

export interface ImportChaptersResult {
  /** Chapters created (all of the import). */
  created: number;
  firstNumber: number;
  lastNumber: number;
  /** Chapters published or scheduled; 0 when importing drafts. */
  published: number;
  /** 1-based position in the import of the chapter where publishing stopped. */
  failedAt?: number;
  /** Error code of that chapter. */
  code?: string;
}

export type ImportChaptersError =
  OwnedStoryError | 'USER_MUTED' | 'ACCOUNT_TOO_NEW' | 'CHAPTER_IMPORT_INVALID';

/** The publishing services the import goes through; replaceable only to simulate failures in tests. */
export interface ImportPublishSteps {
  publish: typeof publishChapter;
  schedule: typeof scheduleChapter;
}

const PUBLISH_STEPS: ImportPublishSteps = { publish: publishChapter, schedule: scheduleChapter };

/**
 * Imports chapters split on the client: every check runs first, then one transaction holding the
 * story row lock (the lock `createChapter` takes) creates all of them as numbered drafts, so the
 * numbers are consecutive and a double submit waits instead of interleaving. To publish or
 * schedule, each chapter then goes through the regular single-chapter service (sanitize, word
 * count, revision, outbox). The first failure there stops the run: the rest stay numbered drafts
 * the author publishes by hand, and the result says where it stopped.
 */
export async function importChapters(
  db: Db,
  actor: StoryActor & { createdAt: Date },
  publicId: string,
  input: ChapterImportInput,
  now: Date = new Date(),
  steps: ImportPublishSteps = PUBLISH_STEPS,
): Promise<Result<ImportChaptersResult, ImportChaptersError>> {
  const trusted = canUseTrustedFeature(actor, now);
  if (trusted !== 'ok') return err(trusted);
  const owned = await loadOwnedStory(db, actor, publicId, { policy: canEditChapter });
  if (!owned.ok) return err(owned.error);
  const prepared = prepareImport(input, now);
  if (!prepared) return err('CHAPTER_IMPORT_INVALID');

  const inserted = await db.transaction(async (tx) => {
    const story = await loadOwnedStory(tx, actor, publicId, {
      forUpdate: true,
      policy: canEditChapter,
    });
    if (!story.ok) return err(story.error);
    return ok(await insertDraftChapters(tx, story.value.id, prepared.chapters));
  });
  if (!inserted.ok) return err(inserted.error);

  const drafts = inserted.value;
  const result: ImportChaptersResult = {
    created: drafts.length,
    firstNumber: drafts[0]?.number ?? 0,
    lastNumber: drafts.at(-1)?.number ?? 0,
    published: 0,
  };
  if (input.mode === 'draft') return ok(result);

  for (const [i, draft] of drafts.entries()) {
    const baseUpdatedAt = draft.draftUpdatedAt.toISOString();
    let code: string | null;
    try {
      const scheduledAt = prepared.scheduleTimes[i];
      const outcome = scheduledAt
        ? await steps.schedule(db, actor, publicId, draft.number, {
            baseUpdatedAt,
            scheduledAt,
            now,
          })
        : await steps.publish(db, actor, publicId, draft.number, { baseUpdatedAt });
      code = outcome.ok ? null : outcome.error;
    } catch (error) {
      console.error(`[chapter-import] publishing chapter ${draft.number} failed`, error);
      code = 'INTERNAL_ERROR';
    }
    if (code) return ok({ ...result, failedAt: i + 1, code });
    result.published += 1;
  }
  return ok(result);
}
