import type { StoryCardDto } from '@novel-hub/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HomeFeaturedPicks } from './home-featured-picks';
import { HomeNewSpotlight } from './home-new-spotlight';
import { HomeRecentlyCompleted } from './home-recently-completed';

const story: StoryCardDto = {
  publicId: 'k7m2xq9p',
  slug: 'truyen',
  title: 'Truyện Một',
  coverUrl: null,
  author: { username: 'tac_gia', displayName: 'Tác Giả' },
  mainTag: { slug: 'tien-hiep', name: 'Tiên hiệp' },
  status: 'completed',
  chapterCount: 40,
  wordCount: 90_000,
  lastChapterAt: '2026-10-01T03:00:00.000Z',
  isAiAssisted: false,
  isMature: false,
};

describe.each([
  ['HomeFeaturedPicks', HomeFeaturedPicks, 'Truyện nổi bật'],
  ['HomeRecentlyCompleted', HomeRecentlyCompleted, 'Trọn bộ, đọc một mạch'],
  ['HomeNewSpotlight', HomeNewSpotlight, 'Truyện mới cần độc giả'],
] as const)('%s', (_name, Section, title) => {
  it('is left out when no story is left', () => {
    expect(renderToStaticMarkup(<Section stories={[]} />)).toBe('');
  });

  it('shows the stories on a shelf with the chapter count and genre', () => {
    const html = renderToStaticMarkup(<Section stories={[story]} />);
    expect(html).toContain(`>${title}</h2>`);
    expect(html).toContain('>40 chương · Tiên hiệp<');
  });
});

describe('HomeRecentlyCompleted', () => {
  it('links to every completed story', () => {
    const html = renderToStaticMarkup(<HomeRecentlyCompleted stories={[story]} />);
    expect(html).toMatch(
      /<a href="\/search\?status=completed" aria-label="Xem thêm truyện đã hoàn thành"[^>]*>Xem thêm</,
    );
  });
});
