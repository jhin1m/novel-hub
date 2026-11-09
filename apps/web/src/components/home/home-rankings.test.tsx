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

  it('opens on the week, ranked in order, with a link to the full board', () => {
    const html = render(data({ week: [story(2), story(1)], day: [story(3)] }));
    expect(html).toContain('>Đang được đọc nhiều</h2>');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Tuần</);
    expect(html.indexOf('Truyện 2')).toBeLessThan(html.indexOf('Truyện 1'));
    expect(html).not.toContain('Truyện 3');
    expect(html).toMatch(/href="\/rankings\/week"[^>]*>Xem đủ bảng tuần</);
    expect(html).not.toContain('/rankings/nominations');
  });

  it('opens on the first non-empty period when the week is empty', () => {
    const html = render(data({ month: [story(4)] }));
    expect(html).toMatch(/aria-pressed="true"[^>]*>Tháng</);
    expect(html).toMatch(/href="\/rankings\/month"[^>]*>Xem đủ bảng tháng</);
    expect(html).toContain('Truyện 4');
  });

  it('gives each row one link, the rank, the genre and the status', () => {
    const html = render(data({ week: [story(1)] }));
    expect(html.match(/<li/g)).toHaveLength(1);
    expect(html).toContain('>Hạng 1<');
    expect(html).toContain('>Tiên hiệp · Đang ra<');
    expect(html.match(/href="\/stories\//g)).toHaveLength(1);
  });

  it('colours the top three ranks and mutes the rest', () => {
    const html = render(data({ week: [1, 2, 3, 4].map(story) }));
    const ranks = html.match(/<span aria-hidden="true" class="[^"]*">\d<\/span>/g) ?? [];
    expect(ranks).toHaveLength(4);
    expect(ranks.slice(0, 3).every((rank) => rank.includes('text-primary'))).toBe(true);
    expect(ranks[3]).toContain('text-muted-foreground');
  });

  it('cuts to the top three and hides the periods on phones with CSS only', () => {
    const html = render(data({ week: [1, 2, 3, 4, 5].map(story) }));
    expect(html.match(/<li/g)).toHaveLength(5);
    expect(html).toContain('max-md:[&amp;&gt;li:nth-child(n+4)]:hidden');
    expect(html).toMatch(/role="group"[^>]*class="[^"]*hidden[^"]*md:flex/);
  });

  it('never loads covers eagerly (the section sits below the hero)', () => {
    const withCover = (n: number) => ({ ...story(n), coverUrl: `https://img.example/${n}.webp` });
    const html = render(data({ week: [1, 2, 3, 4, 5].map(withCover) }));
    expect(html.match(/loading="lazy"/g)).toHaveLength(5);
    expect(html).not.toMatch(/loading="eager"|fetchpriority/i);
  });
});
