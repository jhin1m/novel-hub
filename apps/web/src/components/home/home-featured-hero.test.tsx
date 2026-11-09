import type { HomeHero } from '@novel-hub/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HomeFeaturedHero } from './home-featured-hero';

// The unit project has no `@/` alias: the button's one such import is pointed at the real module.
vi.mock('@/lib/utils', () => vi.importActual('../../lib/utils'));
// Needs the account and shelf queries; only what the hero passes to it matters here.
vi.mock('../library/library-button', () => ({
  LibraryButton: ({ tone }: { tone: string }) => <button data-tone={tone}>Thêm vào tủ</button>,
}));

const COVER = 'https://cdn.example.com/covers/abc/hash-600.webp';

const hero = (patch: Partial<HomeHero> = {}): HomeHero => ({
  publicId: 'k7m2xq9p',
  slug: 'hem-nho',
  title: 'Hẻm Nhỏ',
  coverUrl: COVER,
  author: { username: 'bach_lo', displayName: 'Bạch Lộ' },
  mainTag: { slug: 'do-thi', name: 'Đô thị' },
  status: 'ongoing',
  chapterCount: 8,
  wordCount: 20_000,
  lastChapterAt: null,
  isAiAssisted: false,
  isMature: false,
  synopsis: 'Một tiệm sửa đồ cũ.',
  firstChapterNumber: 2,
  ...patch,
});

const render = (story: HomeHero) => renderToStaticMarkup(<HomeFeaturedHero story={story} />);

describe('HomeFeaturedHero', () => {
  it('with a cover: sits on it blurred, and "read now" opens the first readable chapter', () => {
    const html = render(hero());
    expect(html).toMatch(/<img[^>]*src="[^"]*hash-300\.webp"[^>]*alt=""/);
    expect(html).toContain('Mới đáng chú ý · Đô thị');
    expect(html).toContain('8 chương');
    expect(html).toContain('của Bạch Lộ');
    expect(html).toContain('Một tiệm sửa đồ cũ.');
    expect(html).toMatch(/href="\/stories\/hem-nho-k7m2xq9p\/chapter-2"[^>]*>Đọc ngay</);
    expect(html).toContain('data-tone="on-cover"');
    expect(html).toContain('id="featured-title"');
    // The sharp cover is the one to hurry, not the blurred copy.
    expect(html).not.toMatch(/<img[^>]*src="[^"]*hash-300\.webp"[^>]*fetchPriority/i);
    expect(html).toMatch(/<img[^>]*src="[^"]*hash-600\.webp"[^>]*fetchPriority="high"/i);
  });

  it('without a cover: no blurred image, a text cover and the accent button', () => {
    const html = render(hero({ coverUrl: null }));
    expect(html).not.toContain('<img');
    expect(html).not.toContain('--hero-scrim');
    expect(html).not.toContain('--hero-base');
    expect(html).toContain('role="img"');
    expect(html).toContain('data-tone="default"');
    expect(html).toMatch(
      /class="[^"]*bg-primary[^"]*"[^>]*href="[^"]*chapter-2"|href="[^"]*chapter-2"[^>]*class="[^"]*bg-primary/,
    );
  });

  it('opens the story page when no chapter can be read, and leaves out an empty synopsis', () => {
    const html = render(hero({ firstChapterNumber: null, synopsis: null }));
    expect(html).toMatch(/href="\/stories\/hem-nho-k7m2xq9p"[^>]*>Đọc ngay</);
    expect(html).not.toContain('chapter-');
    expect(html).not.toContain('line-clamp-3 max-w-[56ch]');
  });

  it('uses no gradient and no backdrop filter', () => {
    const html = render(hero());
    expect(html).not.toMatch(/gradient|backdrop-/);
  });
});
