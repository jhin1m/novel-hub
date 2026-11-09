import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { StoryHero, type StoryHeroStory } from './story-hero';

// The unit project has no `@/` alias; the buttons need the account queries, and only the tone the
// hero passes them matters here.
vi.mock('@/lib/utils', () => vi.importActual('../../lib/utils'));
vi.mock('../library/library-button', () => ({
  LibraryButton: ({ tone }: { tone: string }) => <button data-tone={tone}>Thêm vào tủ</button>,
}));
vi.mock('../library/continue-reading-button', () => ({
  ContinueReadingButton: ({ tone }: { tone: string }) => (
    <a data-tone={tone} href="#read">
      Đọc từ đầu
    </a>
  ),
}));
vi.mock('../follow/follow-button', () => ({
  FollowButton: ({ tone }: { tone: string }) => <button data-tone={tone}>Theo dõi</button>,
}));
vi.mock('../nominations/nominate-button', () => ({
  NominateButton: ({ tone }: { tone: string }) => <button data-tone={tone}>Đề cử</button>,
}));

const COVER = 'https://cdn.example.com/covers/abc/hash-600.webp';

const story = (patch: Partial<StoryHeroStory> = {}): StoryHeroStory => ({
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
  ...patch,
});

const render = (s: StoryHeroStory, firstChapterNumber: number | null = 1) =>
  renderToStaticMarkup(
    <StoryHero story={s} chaptersPerWeek={null} firstChapterNumber={firstChapterNumber} />,
  );

describe('StoryHero', () => {
  it('with a cover: sits on it blurred, with the on-cover buttons', () => {
    const html = render(story());
    expect(html).toMatch(/<img[^>]*src="[^"]*hash-300\.webp"[^>]*alt=""[^>]*loading="eager"/);
    expect(html).toContain('bg-(--hero-base)');
    expect(html).toContain('[--story-tint:var(--hero-ink)]');
    expect(html.match(/data-tone="on-cover"/g)).toHaveLength(4);
    expect(html).not.toContain('data-tone="default"');
    expect(html).toContain('md:rotate-[-2deg]');
    // The sharp cover is the one to hurry, not the blurred copy.
    expect(html).toMatch(/<img[^>]*src="[^"]*hash-600\.webp"[^>]*fetchPriority="high"/i);
  });

  it('without a cover: no blurred image, a text cover and the default buttons', () => {
    const html = render(story({ coverUrl: null }));
    expect(html).not.toContain('<img');
    expect(html).not.toContain('--hero-base');
    expect(html).not.toContain('--story-tint');
    expect(html).toContain('role="img"');
    expect(html.match(/data-tone="default"/g)).toHaveLength(4);
    expect(html).not.toContain('md:rotate');
  });

  it('keeps the title as the focus target and links the byline to the author', () => {
    const html = render(story());
    expect(html).toMatch(/<h1 id="story-title" tabindex="-1"/i);
    expect(html).toMatch(/<a href="\/authors\/bach_lo"[^>]*>của Bạch Lộ<\/a>/);
    expect(html).toContain('Đô thị · Đang ra');
  });

  it('adds the AI and 18+ labels to the line above the title only when set', () => {
    expect(render(story())).not.toMatch(/ · AI| · 18\+/);
    expect(render(story({ isAiAssisted: true, isMature: true }))).toContain(
      'Đô thị · Đang ra · AI · 18+',
    );
  });

  it('has no reading link without a readable chapter', () => {
    expect(render(story(), null)).not.toContain('Đọc từ đầu');
  });

  it('uses no gradient and no backdrop filter', () => {
    expect(render(story())).not.toMatch(/gradient|backdrop-/);
  });
});
