import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TopReaderList } from './top-reader-list';

describe('TopReaderList', () => {
  it('ranks readers in order and links each to their author page, without any score', () => {
    const html = renderToStaticMarkup(
      <TopReaderList
        readers={[
          { rank: 1, username: 'lao_mac', displayName: 'Lão Mặc' },
          { rank: 2, username: 'tieu_vu', displayName: 'Tiểu Vũ' },
        ]}
      />,
    );
    expect(html.startsWith('<ol')).toBe(true);
    expect(html.match(/>Hạng \d</g)).toEqual(['>Hạng 1<', '>Hạng 2<']);
    expect(html).toContain('href="/authors/lao_mac"');
    expect(html.indexOf('Lão Mặc')).toBeLessThan(html.indexOf('Tiểu Vũ'));
    expect(html).not.toMatch(/score|điểm/i);
  });
});
