import type { StoryCardDto } from '@novel-hub/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RankingList } from './ranking-list';
import { RankingTabs } from './ranking-tabs';

const story = (n: number): StoryCardDto => ({
  publicId: `k7m2xq9${n}`,
  slug: `truyen-${n}`,
  title: `Truyện ${n}`,
  coverUrl: null,
  author: { username: 'lao_mac', displayName: 'Lão Mặc' },
  mainTag: { slug: 'tien-hiep', name: 'Tiên hiệp' },
  status: 'ongoing',
  chapterCount: 12,
  wordCount: 34_500,
  lastChapterAt: '2026-10-01T03:00:00.000Z',
  isAiAssisted: false,
  isMature: false,
});

describe('RankingList', () => {
  it('numbers the stories 1..n in order, as an ordered list', () => {
    const html = renderToStaticMarkup(<RankingList stories={[story(2), story(5), story(3)]} />);
    expect(html.startsWith('<ol')).toBe(true);
    expect(html.match(/>Hạng \d</g)).toEqual(['>Hạng 1<', '>Hạng 2<', '>Hạng 3<']);
    expect(html.indexOf('Truyện 2')).toBeLessThan(html.indexOf('Truyện 5'));
    expect(html.indexOf('Truyện 5')).toBeLessThan(html.indexOf('Truyện 3'));
  });
});

describe('RankingTabs', () => {
  it('links every period and marks the current one', () => {
    const html = renderToStaticMarkup(<RankingTabs current="rising" />);
    for (const period of ['day', 'week', 'month', 'rising']) {
      expect(html).toContain(`href="/rankings/${period}"`);
    }
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/href="\/rankings\/rising" aria-current="page"[^>]*>Đang lên</);
  });
});
