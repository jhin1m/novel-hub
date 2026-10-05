import { describe, expect, it } from 'vitest';
import { activeMainTab } from './main-nav';

describe('activeMainTab', () => {
  it.each([
    ['/', 'home'],
    ['/search', 'explore'],
    ['/library', 'library'],
    ['/write', 'write'],
    ['/write/stories/abc', 'write'],
    ['/write/stories/abc/chapters/1', 'write'],
    ['/settings', 'me'],
    ['/sign-in', 'me'],
  ])('%s → %s', (pathname, tab) => {
    expect(activeMainTab(pathname)).toBe(tab);
  });

  it.each(['/stories/kiem-dao-k7m2xq9p', '/tags/tien-hiep', '/authors/abc', '/sign-up', '/terms'])(
    '%s belongs to no tab',
    (pathname) => {
      expect(activeMainTab(pathname)).toBeNull();
    },
  );

  it('matches whole path segments only', () => {
    expect(activeMainTab('/writers')).toBeNull();
    expect(activeMainTab('/searching')).toBeNull();
  });
});
