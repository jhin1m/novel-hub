import { describe, expect, it } from 'vitest';
import { CHAPTER_IMPORT_LIMITS, chapterImportSchema } from './chapter-import';

const chapter = { title: 'Chương 1: Mở đầu', text: 'Nội dung' };
const chapters = (count: number) => Array.from({ length: count }, () => chapter);

describe('chapterImportSchema', () => {
  it('accepts drafts up to the draft maximum', () => {
    const input = { chapters: chapters(CHAPTER_IMPORT_LIMITS.maxChapters), mode: 'draft' };
    expect(chapterImportSchema.safeParse(input).success).toBe(true);
    expect(
      chapterImportSchema.safeParse({
        ...input,
        chapters: chapters(CHAPTER_IMPORT_LIMITS.maxChapters + 1),
      }).success,
    ).toBe(false);
  });

  it('caps chapters published or scheduled at once', () => {
    const over = chapters(CHAPTER_IMPORT_LIMITS.maxPublishChapters + 1);
    expect(chapterImportSchema.safeParse({ chapters: over, mode: 'publish' }).success).toBe(false);
    expect(
      chapterImportSchema.safeParse({
        chapters: chapters(CHAPTER_IMPORT_LIMITS.maxPublishChapters),
        mode: 'publish',
      }).success,
    ).toBe(true);
  });

  it('needs a schedule to schedule', () => {
    expect(chapterImportSchema.safeParse({ chapters: [chapter], mode: 'schedule' }).success).toBe(
      false,
    );
    const schedule = { startAt: '2026-10-08T08:00:00+07:00', intervalHours: 24 };
    expect(
      chapterImportSchema.safeParse({ chapters: [chapter], mode: 'schedule', schedule }).success,
    ).toBe(true);
    expect(
      chapterImportSchema.safeParse({
        chapters: [chapter],
        mode: 'schedule',
        schedule: { ...schedule, intervalHours: CHAPTER_IMPORT_LIMITS.maxIntervalHours + 1 },
      }).success,
    ).toBe(false);
  });

  it('limits the total text', () => {
    const big = { text: 'x'.repeat(CHAPTER_IMPORT_LIMITS.maxChapterChars) };
    const count = Math.ceil(CHAPTER_IMPORT_LIMITS.maxTotalChars / big.text.length) + 1;
    expect(
      chapterImportSchema.safeParse({
        chapters: Array.from({ length: count }, () => big),
        mode: 'draft',
      }).success,
    ).toBe(false);
  });

  it('rejects empty chapters, long titles and unknown modes', () => {
    for (const input of [
      { chapters: [], mode: 'draft' },
      { chapters: [{ text: '' }], mode: 'draft' },
      { chapters: [{ title: 'x'.repeat(151), text: 'a' }], mode: 'draft' },
      { chapters: [chapter], mode: 'later' },
    ]) {
      expect(chapterImportSchema.safeParse(input).success).toBe(false);
    }
  });
});
