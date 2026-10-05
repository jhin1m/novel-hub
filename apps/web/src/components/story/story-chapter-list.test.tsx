import { canonicalPath } from '@novel-hub/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StoryChapterList } from './story-chapter-list';

const story = { slug: 'kiem-dao-doc-ton', publicId: 'k7m2xq9p' };
const chapters = [
  { number: 1, title: 'Khởi đầu' },
  { number: 2, title: null },
  { number: 4, title: 'Kết' },
];
const path = (number: number) => canonicalPath({ kind: 'chapter', ...story, number });
const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);

describe('StoryChapterList', () => {
  it('says there is nothing to read when the story has no chapter', () => {
    const html = renderToStaticMarkup(
      <StoryChapterList story={story} chapters={[]} currentNumber={null} />,
    );
    expect(html).toContain('Truyện chưa có chương nào để đọc.');
    expect(html).not.toContain('<a');
  });

  it('pins the newest chapter above the list and links every chapter canonically', () => {
    const html = renderToStaticMarkup(
      <StoryChapterList story={story} chapters={chapters} currentNumber={null} />,
    );
    expect(html).toContain('Mới nhất');
    expect(html).toContain('Chương 4 · Kết');
    expect(hrefs(html)).toEqual([path(4), path(1), path(2), path(4)]);
    expect(html).not.toContain('Đang đọc');
  });

  it('has no "newest" row for a single chapter', () => {
    const html = renderToStaticMarkup(
      <StoryChapterList story={story} chapters={chapters.slice(0, 1)} currentNumber={null} />,
    );
    expect(html).not.toContain('Mới nhất');
    expect(hrefs(html)).toEqual([path(1)]);
  });

  it('marks the chapter the reader is on', () => {
    const html = renderToStaticMarkup(
      <StoryChapterList story={story} chapters={chapters} currentNumber={2} />,
    );
    expect(html.match(/Đang đọc/g)).toHaveLength(1);
    expect(html).toMatch(new RegExp(`href="${path(2)}"[^>]*>(?:(?!</a>).)*Đang đọc`));
  });
});
