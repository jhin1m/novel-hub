import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RankingTabs } from './ranking-tabs';

describe('RankingTabs nominations tab', () => {
  it('links the weekly nominations board after the periods and marks it current there', () => {
    const html = renderToStaticMarkup(<RankingTabs current="nominations" />);
    expect(html.indexOf('href="/rankings/rising"')).toBeLessThan(
      html.indexOf('href="/rankings/nominations"'),
    );
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/href="\/rankings\/nominations" aria-current="page"[^>]*>Đề cử</);
  });
});
