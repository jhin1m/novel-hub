import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { coverPaletteIndex } from '../lib/cover-palette';
import { StoryCover } from './story-cover';

const base = { title: 'Kiếm Đạo Độc Tôn', authorName: 'Lão Mặc', mainTagSlug: 'tien-hiep' };

describe('StoryCover', () => {
  it('renders a text cover with title, pen name and the main tag colour when there is no image', () => {
    const html = renderToStaticMarkup(<StoryCover {...base} coverUrl={null} />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Bìa truyện Kiếm Đạo Độc Tôn"');
    expect(html).toContain('Kiếm Đạo Độc Tôn</p>');
    expect(html).toContain('Lão Mặc</p>');
    expect(html).toContain(`var(--cover-${coverPaletteIndex('tien-hiep')})`);
    expect(html).not.toContain('<img');
  });

  it('draws a book spine and a large faded initial, both hidden from assistive tech', () => {
    const html = renderToStaticMarkup(<StoryCover {...base} coverUrl={null} />);
    expect(html).toMatch(/<span aria-hidden="true" data-slot="cover-spine"/);
    expect(html).toMatch(/<span aria-hidden="true"[^>]*>K<\/span>/);
    expect(html).not.toContain('font-serif');
  });

  it('renders a responsive image with both sizes and fixed dimensions when there is a cover', () => {
    const html = renderToStaticMarkup(
      <StoryCover {...base} coverUrl="https://cdn.example/covers/abc-600.webp" />,
    );
    expect(html).toContain('<img');
    expect(html).toContain('src="https://cdn.example/covers/abc-600.webp"');
    expect(html).toContain('https://cdn.example/covers/abc-300.webp 300w');
    expect(html).toContain('https://cdn.example/covers/abc-600.webp 600w');
    expect(html).toContain('width="600"');
    expect(html).toContain('height="900"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('alt="Bìa truyện Kiếm Đạo Độc Tôn"');
    expect(html).not.toContain('role="img"');
    expect(html).toContain('data-slot="cover-spine"');
  });

  it('loads eagerly with high priority above the fold', () => {
    const html = renderToStaticMarkup(
      <StoryCover {...base} coverUrl="https://cdn.example/covers/abc-600.webp" priority />,
    );
    expect(html).toContain('loading="eager"');
    expect(html).toContain('fetchPriority="high"');
  });

  it('escapes HTML in the title and pen name', () => {
    const html = renderToStaticMarkup(
      <StoryCover {...base} title="<b>Đậm</b>" authorName="<i>x</i>" coverUrl={null} />,
    );
    expect(html).not.toContain('<b>');
    expect(html).not.toContain('<i>');
    expect(html).toContain('&lt;b&gt;Đậm&lt;/b&gt;');
  });
});
