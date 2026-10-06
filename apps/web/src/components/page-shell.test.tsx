import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PageShell, PageTitle } from './page-shell';

describe('PageTitle', () => {
  it('renders a level-1 heading in the UI face', () => {
    const html = renderToStaticMarkup(<PageTitle>Tủ truyện</PageTitle>);
    expect(html).toMatch(/^<h1 [^>]*>Tủ truyện<\/h1>$/);
    expect(html).toContain('font-extrabold');
    expect(html).not.toContain('font-serif');
  });
});

describe('PageShell', () => {
  it('uses the site grid by default and a narrow column for forms', () => {
    expect(renderToStaticMarkup(<PageShell>x</PageShell>)).toContain('max-w-[1240px]');
    const narrow = renderToStaticMarkup(<PageShell width="narrow">x</PageShell>);
    expect(narrow).toContain('max-w-[560px]');
    expect(narrow).not.toContain('max-w-[1240px]');
  });

  it('lets a caller override the width', () => {
    const html = renderToStaticMarkup(
      <PageShell width="narrow" className="max-w-[480px]">
        x
      </PageShell>,
    );
    expect(html).toContain('max-w-[480px]');
    expect(html).not.toContain('max-w-[560px]');
  });
});
