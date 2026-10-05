import { z } from 'zod';
import type { EditorDocJson } from '../editor/doc-json';
import { LIMITS } from '../limits';

export const CHAPTER_STATUSES = ['draft', 'scheduled', 'published', 'hidden_by_mod'] as const;
export type ChapterStatus = (typeof CHAPTER_STATUSES)[number];

/** `/stories/:publicId/chapters/:number`; the public id format itself is checked in `core`. */
export const chapterNumberParamSchema = z.object({
  publicId: z.string(),
  number: z.coerce.number().int().positive().max(2_147_483_647),
});

/**
 * Only the outer shape is checked here; the document itself is checked against the editor schema
 * on the server (`parseEditorDoc`), which needs Tiptap and stays out of this entry.
 */
export const draftSaveSchema = z.object({
  doc: z.custom<EditorDocJson>(
    (value) =>
      typeof value === 'object' &&
      value !== null &&
      (value as { type?: unknown }).type === 'doc' &&
      ((value as { content?: unknown }).content === undefined ||
        Array.isArray((value as { content?: unknown }).content)),
  ),
  baseUpdatedAt: z.iso.datetime(),
});

export type DraftSaveInput = z.output<typeof draftSaveSchema>;

/** Plain text, NFC like story titles; an empty value clears the field. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .normalize('NFC')
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();

export const chapterMetaSchema = z
  .object({
    title: optionalText(LIMITS.chapterTitleMax),
    authorNote: optionalText(LIMITS.authorNoteMax),
  })
  .refine((input) => input.title !== undefined || input.authorNote !== undefined, {
    message: 'At least one field is required',
  });

export type ChapterMetaInput = z.output<typeof chapterMetaSchema>;

/** Publishing always renders the stored draft; `baseUpdatedAt` pins the version the author saw. */
export const publishChapterSchema = z.object({
  baseUpdatedAt: z.iso.datetime(),
});

export type PublishChapterInput = z.output<typeof publishChapterSchema>;

/** `scheduledAt` comes from a `datetime-local` field converted with the browser's offset. */
export const scheduleChapterSchema = z.object({
  baseUpdatedAt: z.iso.datetime(),
  scheduledAt: z.iso.datetime({ offset: true }),
});

export type ScheduleChapterInput = z.output<typeof scheduleChapterSchema>;
