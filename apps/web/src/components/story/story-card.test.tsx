import type { StoryCardDto } from '@novel-hub/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StoryCard } from './story-card';

const story: StoryCardDto = {
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
  isAiAssisted: true,
  isMature: true,
};

/** Every `<a …>…</a>` in the markup. */
const links = (html: string) => html.match(/<a [\s\S]*?<\/a>/g) ?? [];

describe.each(['grid', 'row'] as const)('StoryCard (%s)', (layout) => {
  const html = renderToStaticMarkup(<StoryCard story={story} layout={layout} />);

  it('holds exactly one link, the title, and keeps the cover outside it', () => {
    const all = links(html);
    expect(all).toHaveLength(1);
    expect(all[0]).toContain('href="/stories/kiem-dao-doc-ton-k7m2xq9p"');
    expect(all[0]).toContain('>Kiếm Đạo Độc Tôn</a>');
    expect(all[0]).not.toContain('role="img"');
    expect(html).toContain('aria-label="Bìa truyện Kiếm Đạo Độc Tôn"');
  });

  it('shows the AI and 18+ labels once each', () => {
    expect(html.match(/>Có dùng AI</g)).toHaveLength(1);
    expect(html.match(/>18\+</g)).toHaveLength(1);
  });

  it('sets the title in the bold interface face', () => {
    expect(html).toMatch(/<h3 class="[^"]*font-bold[^"]*">/);
  });
});

describe('StoryCard layouts', () => {
  it('grid shows pen name, tag, chapters, words, last update and the status badge', () => {
    const html = renderToStaticMarkup(<StoryCard story={story} />);
    expect(html).toContain('Tiên hiệp · 12 chương · 34,5 nghìn chữ');
    expect(html).toMatch(/data-variant="default"[^>]*>Đang ra</);
    expect(html).toMatch(/<p class="truncate text-\[13px\][^"]*">Lão Mặc<\/p>/);
    expect(html).toContain('Cập nhật 01/10/2026');
  });

  it('row shows a hidden tag-colour dot, tag, words and last update', () => {
    const html = renderToStaticMarkup(<StoryCard story={story} layout="row" />);
    expect(html).toMatch(/<span aria-hidden="true"[^>]*style="background-color:var\(--cover-2\)"/);
    expect(html).toContain('Tiên hiệp');
    expect(html).toContain('34,5 nghìn chữ');
    expect(html).toContain('Cập nhật 01/10/2026');
    expect(html).not.toContain('Đang ra');
  });
});
