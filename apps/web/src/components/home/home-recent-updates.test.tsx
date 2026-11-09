import type { StoryCardDto } from '@novel-hub/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HomeRecentUpdates } from './home-recent-updates';

const stories = (count: number): StoryCardDto[] =>
  Array.from({ length: count }, (_, i) => ({
    publicId: `id${i}`,
    slug: 'truyen',
    title: `Truyện ${i}`,
    coverUrl: null,
    author: { username: 'tac_gia', displayName: 'Tác Giả' },
    mainTag: { slug: 'tien-hiep', name: 'Tiên hiệp' },
    status: 'ongoing',
    chapterCount: 3,
    wordCount: 6_000,
    lastChapterAt: '2026-10-01T03:00:00.000Z',
    isAiAssisted: false,
    isMature: false,
  }));

describe('HomeRecentUpdates', () => {
  it('shows exactly ten covers however long the list is', () => {
    const html = renderToStaticMarkup(<HomeRecentUpdates stories={stories(24)} />);
    expect(html.match(/<article/g)).toHaveLength(10);
    expect(html).not.toContain('Truyện 10<');
  });

  it('names the latest chapter and the genre, not the chapter title', () => {
    const [story] = stories(1);
    if (!story) throw new Error('no story');
    const html = renderToStaticMarkup(
      <HomeRecentUpdates
        stories={[{ ...story, latestChapter: { number: 3, title: 'Đỉnh núi' } }]}
      />,
    );
    expect(html).toContain('>Chương 3 · Tiên hiệp<');
    expect(html).not.toContain('Đỉnh núi');
  });

  it('falls back to the chapter count without a latest chapter', () => {
    const html = renderToStaticMarkup(<HomeRecentUpdates stories={stories(1)} />);
    expect(html).toContain('>3 chương · Tiên hiệp<');
  });

  it('links to the full list and can take the whole row without the rankings', () => {
    const html = renderToStaticMarkup(<HomeRecentUpdates stories={stories(1)} />);
    expect(html).toMatch(
      /<a href="\/search\?sort=updated" aria-label="Xem thêm truyện mới cập nhật"[^>]*>Xem thêm</,
    );
    expect(html).toContain('flex-[999_1_560px]');
  });

  it('says so when there is no story, without a link', () => {
    const html = renderToStaticMarkup(<HomeRecentUpdates stories={[]} />);
    expect(html).toContain('Chưa có truyện nào.');
    expect(html).not.toContain('<a ');
  });
});
