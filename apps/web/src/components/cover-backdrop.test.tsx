import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CoverBackdrop } from './cover-backdrop';

const COVER = 'https://cdn.example.com/covers/abc/hash-600.webp';

describe('CoverBackdrop', () => {
  it('blurs the 300px variant as a decorative image under a scrim', () => {
    const html = renderToStaticMarkup(<CoverBackdrop coverUrl={COVER} />);
    expect(html).toContain('src="https://cdn.example.com/covers/abc/hash-300.webp"');
    expect(html).toContain('alt=""');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('bg-(--hero-scrim)');
  });

  it('loads eagerly above the fold, leaving fetch priority to the sharp cover', () => {
    const html = renderToStaticMarkup(<CoverBackdrop coverUrl={COVER} eager />);
    expect(html).toContain('loading="eager"');
    expect(html).not.toContain('fetchPriority');
    expect(html).not.toContain('fetchpriority');
  });
});
