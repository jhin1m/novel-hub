import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StoryMeta } from './story-meta';

const base = { chapterCount: 12, wordCount: 12_345 };

describe('StoryMeta', () => {
  it('shows chapters, short word count, pace and last update with their labels', () => {
    const html = renderToStaticMarkup(
      <StoryMeta {...base} chaptersPerWeek={1.5} lastChapterAt="2026-10-04T18:30:00Z" />,
    );
    expect(html).toContain('<dt class="text-xs font-semibold">chương</dt>');
    expect(html).toMatch(/<dd[^>]*>12<\/dd>/);
    expect(html).toMatch(/<dd[^>]*>12,3 nghìn<\/dd>/);
    expect(html).toMatch(/<dd[^>]*>~1,5\/tuần<\/dd>/);
    // Vietnam time: already the next day.
    expect(html).toMatch(/<dd[^>]*>05\/10\/2026<\/dd>/);
    expect(html.match(/<dt/g)).toHaveLength(4);
  });

  it('leaves out the pace without one and the update without a published chapter', () => {
    const html = renderToStaticMarkup(
      <StoryMeta {...base} chaptersPerWeek={null} lastChapterAt={null} />,
    );
    expect(html).not.toContain('ra chương');
    expect(html).not.toContain('cập nhật');
    expect(html.match(/<dt/g)).toHaveLength(2);
  });
});
