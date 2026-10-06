import type { ChapterStatsRow } from '@novel-hub/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  CHAPTER_STATS_PAGE_SIZE,
  ChapterStatsTable,
  pageChapterStats,
} from './chapter-stats-table';

const row = (number: number, views30d: number, dropOffPct: number | null): ChapterStatsRow => ({
  number,
  title: number === 1 ? 'Khởi đầu' : null,
  views30d,
  reached: 10,
  dropOffPct,
});

describe('ChapterStatsTable', () => {
  it('renders a row per chapter, bars relative to the most-read one, and — without drop-off', () => {
    const html = renderToStaticMarkup(
      <ChapterStatsTable
        rows={[row(1, 1200, 33.3), row(2, 300, 0), row(3, 0, null)]}
        maxViews={1200}
      />,
    );
    expect(html).toContain('<table');
    expect(html.match(/<th scope="row"/g)).toHaveLength(3);
    expect(html).toContain('Chương 1');
    expect(html).toContain('Khởi đầu');
    expect(html).toContain('1.200');
    expect(html).toContain('33,3%');
    expect(html).toContain('>0%<');
    expect(html).toContain('>—<');
    expect(html).toContain('width:100%');
    expect(html).toContain('width:25%');
    expect(html).toContain('width:0%');
  });

  it('draws empty bars when nothing was read', () => {
    const html = renderToStaticMarkup(<ChapterStatsTable rows={[row(1, 0, 0)]} maxViews={0} />);
    expect(html).toContain('width:0%');
    expect(html).not.toContain('NaN');
  });
});

describe('pageChapterStats', () => {
  const chapters = Array.from({ length: CHAPTER_STATS_PAGE_SIZE + 5 }, (_, i) =>
    row(i + 1, i, null),
  );

  it('pages long stories 100 chapters at a time', () => {
    const first = pageChapterStats(chapters, 1);
    expect(first.totalPages).toBe(2);
    expect(first.rows.map((r) => r.number)).toEqual(
      Array.from({ length: CHAPTER_STATS_PAGE_SIZE }, (_, i) => i + 1),
    );
    expect(pageChapterStats(chapters, 2).rows.map((r) => r.number)).toEqual([
      101, 102, 103, 104, 105,
    ]);
  });

  it('clamps the page and keeps one page for a short story', () => {
    expect(pageChapterStats(chapters, 9).page).toBe(2);
    expect(pageChapterStats([row(1, 0, null)], 1)).toMatchObject({ page: 1, totalPages: 1 });
  });
});
