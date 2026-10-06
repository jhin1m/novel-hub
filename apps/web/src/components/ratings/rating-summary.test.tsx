import type { RatingSummaryDto } from '@novel-hub/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RatingSummary } from './rating-summary';

describe('RatingSummary', () => {
  it('shows the empty state while nobody rated', () => {
    const empty: RatingSummaryDto = {
      count: 0,
      average: null,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    };
    const html = renderToStaticMarkup(<RatingSummary summary={empty} />);
    expect(html).toContain('Chưa có đánh giá nào');
    expect(html).not.toContain('<ul');
  });

  it('shows the average with one decimal, the count and a bar per score from 5 to 1', () => {
    const summary: RatingSummaryDto = {
      count: 4,
      average: 4,
      distribution: { 1: 0, 2: 0, 3: 1, 4: 1, 5: 2 },
    };
    const html = renderToStaticMarkup(<RatingSummary summary={summary} />);
    expect(html).toContain('4,0');
    expect(html).toContain('4 lượt đánh giá');
    expect(html).toContain('Điểm trung bình 4,0 trên 5');
    const rows = [...html.matchAll(/aria-label="(\d) sao: (\d) lượt"/g)].map((r) => r[1]);
    expect(rows).toEqual(['5', '4', '3', '2', '1']);
    expect(html).toContain('width:50%');
    expect(html).toContain('width:0%');
  });
});
