import { CHAPTER_IMPORT_LIMITS } from '@novel-hub/shared';
import { describe, expect, it } from 'vitest';
import { importIssue, scheduleInWindow, toImportRows } from './chapter-import-rows';

const words = (count: number) => Array.from({ length: count }, (_, i) => `chữ${i}`).join(' ');

describe('toImportRows', () => {
  it('counts words and checks the publish range per chapter', () => {
    const rows = toImportRows([
      { title: 'Một', lines: [words(150), words(150)] },
      { title: '', lines: [words(299)] },
      { title: '', lines: [] },
    ]);
    expect(rows.map((row) => [row.words, row.wordsInRange])).toEqual([
      [300, true],
      [299, false],
      [0, false],
    ]);
    expect(rows[0]?.text.split('\n')).toHaveLength(2);
    expect(rows[2]?.text).toBe(' ');
  });

  it('cuts an over-long title to the limit', () => {
    const [row] = toImportRows([{ title: 'a'.repeat(200), lines: ['x'] }]);
    expect(row?.title).toHaveLength(150);
  });
});

describe('importIssue', () => {
  const one = toImportRows([{ title: '', lines: ['x'] }]);

  it('allows up to 100 drafts but 30 chapters to publish', () => {
    const rows = Array.from({ length: 31 }, () => one[0]!);
    expect(importIssue(rows, 'draft')).toBeNull();
    expect(importIssue(rows, 'publish')).toEqual({ kind: 'too_many', max: 30 });
    expect(importIssue(rows, 'schedule')).toEqual({ kind: 'too_many', max: 30 });
    expect(importIssue([...rows, ...rows, ...rows, ...rows], 'draft')).toEqual({
      kind: 'too_many',
      max: 100,
    });
  });

  it('flags a chapter or a total that is too long', () => {
    const long = { ...one[0]!, text: 'a'.repeat(CHAPTER_IMPORT_LIMITS.maxChapterChars + 1) };
    expect(importIssue([long], 'draft')).toEqual({ kind: 'too_large' });
    const big = { ...one[0]!, text: 'a'.repeat(CHAPTER_IMPORT_LIMITS.maxChapterChars) };
    const count = Math.ceil(CHAPTER_IMPORT_LIMITS.maxTotalChars / big.text.length) + 1;
    expect(
      importIssue(
        Array.from({ length: count }, () => big),
        'draft',
      ),
    ).toEqual({
      kind: 'too_large',
    });
  });

  it('flags an import with too many paragraphs in total', () => {
    const row = { ...one[0]!, paragraphs: CHAPTER_IMPORT_LIMITS.maxParagraphs / 2 };
    expect(importIssue([row, row], 'draft')).toBeNull();
    expect(importIssue([row, row, one[0]!], 'draft')).toEqual({ kind: 'too_large' });
  });
});

describe('scheduleInWindow', () => {
  const now = Date.UTC(2026, 9, 7);
  const HOUR = 3_600_000;

  it('needs the first time 5 minutes ahead and the last within 365 days', () => {
    expect(scheduleInWindow(now + HOUR, 24, 30, now)).toBe(true);
    expect(scheduleInWindow(now + 4 * 60_000, 24, 1, now)).toBe(false);
    // 30 chapters every 720 hours end 870 days out.
    expect(scheduleInWindow(now + HOUR, 720, 30, now)).toBe(false);
    expect(scheduleInWindow(now + HOUR, 720, 12, now)).toBe(true);
  });
});
