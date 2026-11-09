import type { StoryCardDto } from '@novel-hub/core';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HomeRecentUpdates } from './home-recent-updates';

// The UI kit imports through the `@/` alias, which unit tests do not resolve.
vi.mock('../ui/button', () => ({
  Button: ({ children }: { children: ReactNode }) => children,
}));

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

const lists = (html: string) => html.match(/<ul/g)?.length ?? 0;

describe('HomeRecentUpdates', () => {
  it('shows the latest six as covers and at most twelve more as rows', () => {
    const html = renderToStaticMarkup(<HomeRecentUpdates stories={stories(24)} />);
    expect(html.match(/<article/g)).toHaveLength(18);
    expect(lists(html)).toBe(2);
    expect(html).not.toContain('Truyện 18<');
  });

  it('names the latest chapter on a cover card too', () => {
    const [story] = stories(1);
    if (!story) throw new Error('no story');
    const html = renderToStaticMarkup(
      <HomeRecentUpdates
        stories={[{ ...story, latestChapter: { number: 3, title: 'Đỉnh núi' } }]}
      />,
    );
    expect(html).toContain('Chương 3 · Đỉnh núi');
  });

  it('leaves out the rows when every story fits among the covers', () => {
    const html = renderToStaticMarkup(<HomeRecentUpdates stories={stories(4)} />);
    expect(html.match(/<article/g)).toHaveLength(4);
    expect(lists(html)).toBe(1);
  });
});
