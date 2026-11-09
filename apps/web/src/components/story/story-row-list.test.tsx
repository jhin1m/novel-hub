import type { StoryCardDto } from '@novel-hub/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StoryRowList } from './story-row-list';

const story = (publicId: string): StoryCardDto => ({
  publicId,
  slug: 'truyen',
  title: `Truyện ${publicId}`,
  coverUrl: null,
  author: { username: 'tac_gia', displayName: 'Tác Giả' },
  mainTag: { slug: 'tien-hiep', name: 'Tiên hiệp' },
  status: 'ongoing',
  chapterCount: 3,
  wordCount: 6_000,
  lastChapterAt: '2026-10-01T03:00:00.000Z',
  isAiAssisted: false,
  isMature: false,
});

describe('StoryRowList', () => {
  it('renders every row in the HTML', () => {
    const html = renderToStaticMarkup(<StoryRowList stories={['a', 'b', 'c'].map(story)} />);
    expect(html.match(/<li>/g)).toHaveLength(3);
  });
});
