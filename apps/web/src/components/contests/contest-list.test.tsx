import type { ContestListDto, ContestSummaryDto } from '@novel-hub/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ContestList } from './contest-list';

const contest = (slug: string, title: string): ContestSummaryDto => ({
  slug,
  title,
  startsAt: '2026-10-01T01:00:00.000Z',
  endsAt: '2026-10-31T01:00:00.000Z',
  status: 'open',
  entryCount: 3,
});

describe('ContestList', () => {
  it('shows the three groups in order, each with its contests or an empty note', () => {
    const list: ContestListDto = {
      open: [contest('mua-thu', 'Mùa Thu')],
      upcoming: [],
      ended: [contest('mua-he', 'Mùa Hè')],
    };
    const html = renderToStaticMarkup(<ContestList list={list} />);
    const headings = [...html.matchAll(/<h2 id="contests-(\w+)"[^>]*>([^<]+)<\/h2>/g)].map(
      (match) => [match[1], match[2]],
    );
    expect(headings).toEqual([
      ['open', 'Đang diễn ra'],
      ['upcoming', 'Sắp diễn ra'],
      ['ended', 'Đã kết thúc'],
    ]);
    expect(html).toContain('href="/contests/mua-thu"');
    expect(html).toContain('href="/contests/mua-he"');
    expect(html).toContain('08:00 01/10/2026 – 08:00 31/10/2026 · 3 bài dự thi');
    expect(html.match(/Chưa có cuộc thi nào\./g)).toHaveLength(1);
  });
});
