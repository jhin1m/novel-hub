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

const HIDE_PAST_12_ON_PHONES = 'max-md:[&amp;&gt;li:nth-child(n+13)]:hidden';

describe('StoryRowList', () => {
  const stories = ['a', 'b', 'c'].map(story);

  it('renders every row in the HTML and hides none by default', () => {
    const html = renderToStaticMarkup(<StoryRowList stories={stories} />);
    expect(html.match(/<li>/g)).toHaveLength(3);
    expect(html).not.toContain('nth-child');
  });

  it('hides rows past the 12th below md with CSS when compactOnMobile', () => {
    const html = renderToStaticMarkup(<StoryRowList stories={stories} compactOnMobile />);
    expect(html.match(/<li>/g)).toHaveLength(3);
    expect(html).toContain(HIDE_PAST_12_ON_PHONES);
  });
});
