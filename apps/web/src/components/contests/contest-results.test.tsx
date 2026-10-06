import type { StoryCardDto } from '@novel-hub/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ContestResults } from './contest-results';

const story: StoryCardDto = {
  publicId: 'k7m2xq9p',
  slug: 'kiem-dao-doc-ton',
  title: 'Kiếm Đạo Độc Tôn',
  coverUrl: null,
  author: { username: 'lao_mac', displayName: 'Lão Mặc' },
  mainTag: { slug: 'tien-hiep', name: 'Tiên hiệp' },
  status: 'completed',
  chapterCount: 12,
  wordCount: 34_500,
  lastChapterAt: '2026-10-01T03:00:00.000Z',
  isAiAssisted: false,
  isMature: false,
};

describe('ContestResults', () => {
  it('renders nothing until a place is awarded', () => {
    expect(renderToStaticMarkup(<ContestResults winners={[]} />)).toBe('');
  });

  it('lists the winners by place under a "Kết quả" heading', () => {
    const html = renderToStaticMarkup(
      <ContestResults
        winners={[
          { placement: 1, story },
          { placement: 2, story: { ...story, publicId: 'a2b3c4d5', title: 'Truyện Hai' } },
        ]}
      />,
    );
    expect(html).toMatch(/<h2 id="contest-results"[^>]*>Kết quả<\/h2>/);
    expect(html.indexOf('Hạng 1')).toBeLessThan(html.indexOf('Hạng 2'));
    expect(html).toContain('>Kiếm Đạo Độc Tôn</a>');
    expect(html).toContain('>Truyện Hai</a>');
  });
});
