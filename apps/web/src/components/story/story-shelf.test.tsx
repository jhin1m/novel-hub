import type { StoryCardDto } from '@novel-hub/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StoryShelf, StoryShelfHeading } from './story-shelf';
import { StoryShelfCard, chapterCountMeta } from './story-shelf-card';

const story = (overrides: Partial<StoryCardDto> = {}): StoryCardDto => ({
  publicId: 'k7m2xq9p',
  slug: 'kiem-dao-doc-ton',
  title: 'Kiếm Đạo Độc Tôn',
  coverUrl: null,
  author: { username: 'lao_mac', displayName: 'Lão Mặc' },
  mainTag: { slug: 'tien-hiep', name: 'Tiên hiệp' },
  status: 'ongoing',
  chapterCount: 12,
  wordCount: 34_500,
  lastChapterAt: '2026-10-01T03:00:00.000Z',
  isAiAssisted: false,
  isMature: false,
  ...overrides,
});

const links = (html: string) => html.match(/<a [\s\S]*?<\/a>/g) ?? [];

describe('StoryShelfCard', () => {
  const flagged = story({ isAiAssisted: true, isMature: true });

  it('holds one link, the title, stretched over the card', () => {
    const html = renderToStaticMarkup(
      <StoryShelfCard story={flagged} meta="Chương 3 · Tiên hiệp" />,
    );
    const all = links(html);
    expect(all).toHaveLength(1);
    expect(all[0]).toContain('href="/stories/kiem-dao-doc-ton-k7m2xq9p"');
    expect(all[0]).toContain('after:inset-0');
    expect(all[0]).not.toContain('role="img"');
  });

  it('keeps the meta and both labels on one line, only the text truncating', () => {
    const html = renderToStaticMarkup(
      <StoryShelfCard story={flagged} meta="Chương 3 · Tiên hiệp" />,
    );
    expect(html).toMatch(/<span class="[^"]*truncate[^"]*">Chương 3 · Tiên hiệp<\/span>/);
    expect(html).toMatch(/data-variant="outline"[^>]*>AI</);
    expect(html).toMatch(/data-variant="destructive"[^>]*>18\+</);
    expect(html).toContain('shrink-0');
  });

  it('shows the title alone when compact', () => {
    const html = renderToStaticMarkup(<StoryShelfCard story={flagged} meta="ẩn" compact />);
    expect(html).toContain('Kiếm Đạo Độc Tôn</a>');
    expect(html).not.toContain('ẩn');
    expect(html).not.toContain('>18+<');
    expect(html).toMatch(/<h3 class="[^"]*text-\[13px\][^"]*leading-\[1\.3\]/);
  });

  it('keeps the title line height and paints the shelf line over the cover shadow', () => {
    const html = renderToStaticMarkup(<StoryShelfCard story={flagged} meta="meta" />);
    expect(html).toMatch(/<h3 class="[^"]*text-\[15px\][^"]*leading-\[1\.3\]/);
    expect(html).toMatch(/<div aria-hidden="true" class="relative bg-\(--shelf-line\)/);
  });

  it('counts the chapters in the shared meta', () => {
    expect(chapterCountMeta(story())).toBe('12 chương · Tiên hiệp');
  });
});

describe('StoryShelf', () => {
  const stories = Array.from({ length: 24 }, (_, i) =>
    story({ publicId: `id${i}`, title: `Truyện ${i}` }),
  );
  const renderMeta = () => 'meta';

  it('cuts the list at the limit in the HTML', () => {
    const html = renderToStaticMarkup(
      <StoryShelf stories={stories} limit={10} renderMeta={renderMeta} />,
    );
    expect(html.match(/<article/g)).toHaveLength(10);
    expect(html).not.toContain('Truyện 10<');
  });

  it('shows every story without a limit', () => {
    const html = renderToStaticMarkup(<StoryShelf stories={stories} renderMeta={renderMeta} />);
    expect(html.match(/<article/g)).toHaveLength(24);
  });

  it('cuts for phones with CSS only, every card staying in the HTML', () => {
    const html = renderToStaticMarkup(
      <StoryShelf stories={stories} limit={10} mobileLimit={5} renderMeta={renderMeta} />,
    );
    expect(html.match(/<article/g)).toHaveLength(10);
    expect(html).toContain('max-sm:[&amp;&gt;li:nth-child(n+6)]:hidden');
  });
});

describe('StoryShelfHeading', () => {
  it('names the link for screen readers while showing the shared text', () => {
    const html = renderToStaticMarkup(
      <StoryShelfHeading id="x" title="Kệ" more={{ href: '/search', label: 'Xem thêm kệ này' }} />,
    );
    expect(html).toMatch(/<a href="\/search" aria-label="Xem thêm kệ này"[^>]*>Xem thêm<\/a>/);
  });

  it('has no link without one to give', () => {
    expect(renderToStaticMarkup(<StoryShelfHeading id="x" title="Kệ" />)).not.toContain('<a ');
  });
});
