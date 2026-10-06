import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BadgeList } from './badge-list';

describe('BadgeList', () => {
  it('renders nothing without badges', () => {
    expect(renderToStaticMarkup(<BadgeList badges={[]} />)).toBe('');
  });

  it('renders one labelled item per badge, in the given order', () => {
    const html = renderToStaticMarkup(
      <BadgeList badges={[{ code: 'first_chapter' }, { code: 'chapters_10' }]} />,
    );
    expect(html).toContain('aria-label="Huy hiệu"');
    const items = [...html.matchAll(/<li[^>]*title="([^"]*)"[^>]*>.*?<\/svg>([^<]*)</g)].map(
      (match) => [match[1], match[2]],
    );
    expect(items).toEqual([
      ['Đã đăng chương đầu tiên', 'Chương đầu tiên'],
      ['Đã đăng 10 chương', '10 chương'],
    ]);
  });
});
