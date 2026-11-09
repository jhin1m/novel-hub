import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TagChip } from './tag-chip';

describe('TagChip', () => {
  it('links to the tag page with a colour dot and no kind when none is given', () => {
    const html = renderToStaticMarkup(<TagChip slug="tien-hiep" name="Tiên hiệp" />);
    expect(html).toContain('href="/tags/tien-hiep"');
    expect(html).not.toContain('data-kind');
    expect(html).toContain('bg-card');
    expect(html).not.toContain('bg-warning-soft');
    expect(html).toContain('background-color:');
    expect(html).not.toContain('<svg');
  });

  it('marks a content warning with the warning colours and an alert icon instead of the dot', () => {
    const html = renderToStaticMarkup(<TagChip slug="bao-luc" name="Bạo lực" kind="warning" />);
    expect(html).toContain('data-kind="warning"');
    expect(html).toContain('bg-warning-soft');
    expect(html).toContain('text-warning-foreground');
    expect(html).not.toContain('bg-card');
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html).not.toContain('background-color:');
    expect(html).toContain('>Bạo lực</a>');
  });

  it('keeps the regular look for genre and theme tags', () => {
    for (const kind of ['genre', 'theme'] as const) {
      const html = renderToStaticMarkup(<TagChip slug="x" name="X" kind={kind} />);
      expect(html).toContain(`data-kind="${kind}"`);
      expect(html).toContain('bg-card');
      expect(html).not.toContain('bg-warning-soft');
    }
  });
});
