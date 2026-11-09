import { describe, expect, it } from 'vitest';
import { parseChapterText } from './parse-chapter-text';

describe('parseChapterText', () => {
  it('splits on the heading variants and keeps the name after the separator', () => {
    const parsed = parseChapterText(
      [
        'Chương 1: Khởi đầu',
        'Dòng một.',
        '',
        '  Dòng hai.  ',
        'CHƯƠNG 2 - Gặp gỡ',
        'Nội dung hai.',
        'Chuong 3',
        'Nội dung ba.',
        'chương 4 — Kết',
        'Chương 5.',
      ].join('\n'),
    );
    expect(parsed).toEqual({
      leadingTextDropped: false,
      chapters: [
        { title: 'Khởi đầu', lines: ['Dòng một.', 'Dòng hai.'] },
        { title: 'Gặp gỡ', lines: ['Nội dung hai.'] },
        { title: '', lines: ['Nội dung ba.'] },
        { title: 'Kết', lines: [] },
        { title: '', lines: [] },
      ],
    });
  });

  it('handles CRLF, a BOM and decomposed (NFD) text', () => {
    const raw = '\uFEFFChương 1: Tên\r\nDòng một\r\nDòng hai'.normalize('NFD');
    const parsed = parseChapterText(raw);
    expect(parsed.chapters).toEqual([{ title: 'Tên', lines: ['Dòng một', 'Dòng hai'] }]);
    expect(parsed.chapters[0]?.title).toBe('Tên'.normalize('NFC'));
  });

  it('drops NUL characters', () => {
    expect(parseChapterText('Chương 1: A\u0000B\nMột\u0000 hai').chapters).toEqual([
      { title: 'AB', lines: ['Một hai'] },
    ]);
  });

  it('drops text before the first heading and says so', () => {
    const parsed = parseChapterText('Lời tựa\n\nChương 1\nNội dung');
    expect(parsed.leadingTextDropped).toBe(true);
    expect(parsed.chapters).toEqual([{ title: '', lines: ['Nội dung'] }]);
    expect(parseChapterText('\n  \nChương 1\nA').leadingTextDropped).toBe(false);
  });

  it('finds no chapter without a heading line', () => {
    expect(parseChapterText('Chỉ có văn bản.\nKhông có tiêu đề.')).toEqual({
      chapters: [],
      leadingTextDropped: true,
    });
    expect(parseChapterText('')).toEqual({ chapters: [], leadingTextDropped: false });
  });

  it('does not split on "chương" inside a sentence', () => {
    const parsed = parseChapterText(
      'Chương 1\nHắn đọc lại chương 3 của cuốn sách.\nchương 2 bắt đầu thế này thì lạ.',
    );
    expect(parsed.chapters).toHaveLength(1);
    expect(parsed.chapters[0]?.lines).toHaveLength(2);
  });

  it('returns every chapter, even past the import limit', () => {
    const raw = Array.from({ length: 101 }, (_, i) => `Chương ${i + 1}\nNội dung ${i}`).join('\n');
    expect(parseChapterText(raw).chapters).toHaveLength(101);
  });
});
