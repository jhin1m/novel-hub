import { BookOpen } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SectionHeading } from './section-heading';

describe('SectionHeading', () => {
  it('renders an h2 with the id and keeps the subtitle and icon out of its name', () => {
    const html = renderToStaticMarkup(
      <SectionHeading
        id="latest"
        icon={BookOpen}
        title="Mới cập nhật"
        subtitle="Chương mới nhất"
      />,
    );
    expect(html).toMatch(/<h2 id="latest"[^>]*>Mới cập nhật<\/h2>/);
    expect(html).toContain('Chương mới nhất</p>');
    expect(html).toMatch(/<span aria-hidden="true"[^>]*><svg/);
  });

  it('without an icon it has no tile and is the larger plain title', () => {
    const html = renderToStaticMarkup(<SectionHeading id="a" title="Giới thiệu" />);
    expect(html).not.toContain('aria-hidden');
    expect(html).toMatch(/<h2 id="a"[^>]*md:text-\[26px\][^>]*>Giới thiệu<\/h2>/);
    expect(html).toContain('leading-tight');
  });

  it('switches the icon tile to the card surface on the band strip', () => {
    const plain = renderToStaticMarkup(<SectionHeading id="a" icon={BookOpen} title="A" />);
    const band = renderToStaticMarkup(<SectionHeading id="a" icon={BookOpen} title="A" onBand />);
    expect(plain).toContain('bg-primary-soft');
    expect(band).toContain('bg-card');
    expect(band).not.toContain('bg-primary-soft');
    expect(plain).not.toContain('</p>');
  });
});
