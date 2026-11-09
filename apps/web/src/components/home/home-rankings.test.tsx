import type { HomeRankings as HomeRankingsData, StoryCardDto } from '@novel-hub/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HomeRankings } from './home-rankings';

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

const data = (
  periods: Partial<HomeRankingsData['periods']>,
  available = true,
): HomeRankingsData => ({
  available,
  periods: { day: [], week: [], month: [], rising: [], ...periods },
});

const render = (rankings: HomeRankingsData) =>
  renderToStaticMarkup(<HomeRankings rankings={rankings} />);

describe('HomeRankings', () => {
  it('renders nothing when the rankings are unavailable or rank nothing', () => {
    expect(render(data({}))).toBe('');
    expect(render(data({ week: [story(1)] }, false))).toBe('');
  });

  it('opens on the week, ranked in order, with links to the full board and the nominations', () => {
    const html = render(data({ week: [story(2), story(1)], day: [story(3)] }));
    expect(html).toContain('Bảng xếp hạng');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Tuần</);
    expect(html.indexOf('Truyện 2')).toBeLessThan(html.indexOf('Truyện 1'));
    expect(html).not.toContain('Truyện 3');
    expect(html).toMatch(/href="\/rankings\/week"[^>]*>Xem đủ bảng tuần</);
    expect(html).toMatch(/href="\/rankings\/nominations"[^>]*>Được đề cử nhiều</);
  });

  it('opens on the first non-empty period when the week is empty', () => {
    const html = render(data({ month: [story(4)] }));
    expect(html).toMatch(/aria-pressed="true"[^>]*>Tháng</);
    expect(html).toMatch(/href="\/rankings\/month"[^>]*>Xem đủ bảng tháng</);
    expect(html).toContain('Truyện 4');
  });

  it('never loads covers eagerly (the section sits below the hero)', () => {
    const withCover = (n: number) => ({ ...story(n), coverUrl: `https://img.example/${n}.webp` });
    const html = render(data({ week: [1, 2, 3, 4, 5].map(withCover) }));
    expect(html.match(/loading="lazy"/g)).toHaveLength(5);
    expect(html).not.toMatch(/loading="eager"|fetchpriority/i);
  });
});
