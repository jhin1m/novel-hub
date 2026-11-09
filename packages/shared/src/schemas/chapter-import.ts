import { z } from 'zod';
import { LIMITS } from '../limits';

export const CHAPTER_IMPORT_LIMITS = {
  /** Chapters per import saved as drafts. */
  maxChapters: 100,
  /** Chapters per import published now or scheduled (the `publishChapter` hourly pace). */
  maxPublishChapters: 30,
  /** Characters of all chapters together. */
  maxTotalChars: 1_500_000,
  /**
   * Paragraphs (non-blank lines) of a whole import. Every line becomes a paragraph node of ~85 bytes
   * of JSON, so short lines inflate a request many times over; this caps the total well above real
   * chapters (100 chapters of 500 lines).
   */
  maxParagraphs: 50_000,
  /** Characters per chapter; its document must stay under `LIMITS.draftMaxBytes`, core rechecks. */
  maxChapterChars: 400_000,
  /** Longest gap between two scheduled chapters (hours). */
  maxIntervalHours: 720,
  /** Request body cap of the import endpoint. */
  bodyLimitBytes: 4 * 1024 * 1024,
} as const;

/** After import: keep as drafts, publish now, or schedule at even intervals. */
export const CHAPTER_IMPORT_MODES = ['draft', 'publish', 'schedule'] as const;
export type ChapterImportMode = (typeof CHAPTER_IMPORT_MODES)[number];

/** Body of the chapter import: chapters already split on the client, in order. */
export const chapterImportSchema = z
  .object({
    chapters: z
      .array(
        z
          .object({
            title: z.string().trim().max(LIMITS.chapterTitleMax).optional(),
            text: z.string().min(1).max(CHAPTER_IMPORT_LIMITS.maxChapterChars),
          })
          .strict(),
      )
      .min(1)
      .max(CHAPTER_IMPORT_LIMITS.maxChapters),
    mode: z.enum(CHAPTER_IMPORT_MODES),
    schedule: z
      .object({
        startAt: z.iso.datetime({ offset: true }),
        intervalHours: z.number().int().min(1).max(CHAPTER_IMPORT_LIMITS.maxIntervalHours),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.mode === 'schedule' && !input.schedule) {
      ctx.addIssue({ code: 'custom', path: ['schedule'], message: 'Required to schedule' });
    }
    if (
      input.mode !== 'draft' &&
      input.chapters.length > CHAPTER_IMPORT_LIMITS.maxPublishChapters
    ) {
      ctx.addIssue({ code: 'custom', path: ['chapters'], message: 'Too many to publish at once' });
    }
    const total = input.chapters.reduce((sum, chapter) => sum + chapter.text.length, 0);
    if (total > CHAPTER_IMPORT_LIMITS.maxTotalChars) {
      ctx.addIssue({ code: 'custom', path: ['chapters'], message: 'Too much text' });
    }
  });
export type ChapterImportInput = z.output<typeof chapterImportSchema>;
