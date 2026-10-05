import { describe, expect, it } from 'vitest';
import { type StoryDoc, storyDocToCard } from './documents';

const doc: StoryDoc = {
  publicId: 'k7m2xq9p',
  slug: 'kiem-dao-doc-ton',
  title: 'Kiếm Đạo Độc Tôn',
  synopsis: 'Giới thiệu',
  authorUsername: 'lam_phong',
  authorName: 'Lâm Phong',
  coverUrl: null,
  mainTagSlug: 'tien-hiep',
  mainTagName: 'Tiên hiệp',
  tagSlugs: ['tien-hiep'],
  status: 'ongoing',
  wordCount: 1200,
  chapterCount: 3,
  lastChapterAt: 1_790_000_000,
  createdAt: 1_780_000_000,
  isMature: false,
  isAiAssisted: true,
};

describe('storyDocToCard', () => {
  it('rebuilds the public card from a hit', () => {
    expect(storyDocToCard(doc)).toEqual({
      publicId: 'k7m2xq9p',
      slug: 'kiem-dao-doc-ton',
      title: 'Kiếm Đạo Độc Tôn',
      coverUrl: null,
      author: { username: 'lam_phong', displayName: 'Lâm Phong' },
      mainTag: { slug: 'tien-hiep', name: 'Tiên hiệp' },
      status: 'ongoing',
      chapterCount: 3,
      wordCount: 1200,
      lastChapterAt: new Date(1_790_000_000 * 1000).toISOString(),
      isAiAssisted: true,
      isMature: false,
    });
  });

  it('maps a story without chapters (0) back to null', () => {
    expect(storyDocToCard({ ...doc, lastChapterAt: 0 }).lastChapterAt).toBeNull();
  });

  it('leaves extra hit fields out', () => {
    const hit = { ...doc, _rankingScore: 0.9 } as StoryDoc;
    expect(storyDocToCard(hit)).not.toHaveProperty('_rankingScore');
  });
});
