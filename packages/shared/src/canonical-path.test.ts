import { describe, expect, it } from 'vitest';
import { canonicalPath } from './canonical-path';

describe('canonicalPath', () => {
  it('builds every kind of public URL', () => {
    expect(canonicalPath({ kind: 'home' })).toBe('/');
    expect(canonicalPath({ kind: 'story', slug: 'kiem-dao', publicId: 'k7m2xq9p' })).toBe(
      '/stories/kiem-dao-k7m2xq9p',
    );
    expect(
      canonicalPath({ kind: 'chapter', slug: 'kiem-dao', publicId: 'k7m2xq9p', number: 3 }),
    ).toBe('/stories/kiem-dao-k7m2xq9p/chapter-3');
    expect(canonicalPath({ kind: 'author', username: 'lam_phong' })).toBe('/authors/lam_phong');
    expect(canonicalPath({ kind: 'static', path: '/terms' })).toBe('/terms');
    expect(canonicalPath({ kind: 'ranking', period: 'week' })).toBe('/rankings/week');
    expect(canonicalPath({ kind: 'ranking', period: 'rising' })).toBe('/rankings/rising');
    expect(canonicalPath({ kind: 'contests' })).toBe('/contests');
    expect(canonicalPath({ kind: 'contest', slug: 'mua-thu' })).toBe('/contests/mua-thu');
    expect(canonicalPath({ kind: 'contest', slug: 'mua-thu', page: 1 })).toBe('/contests/mua-thu');
    expect(canonicalPath({ kind: 'contest', slug: 'mua-thu', page: 3 })).toBe(
      '/contests/mua-thu?page=3',
    );
  });

  it('adds the page query to tag pages only past the first page', () => {
    expect(canonicalPath({ kind: 'tag', slug: 'tien-hiep' })).toBe('/tags/tien-hiep');
    expect(canonicalPath({ kind: 'tag', slug: 'tien-hiep', page: 1 })).toBe('/tags/tien-hiep');
    expect(canonicalPath({ kind: 'tag', slug: 'tien-hiep', page: 2 })).toBe(
      '/tags/tien-hiep?page=2',
    );
  });
});
