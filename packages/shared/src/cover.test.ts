import { describe, expect, it } from 'vitest';
import { coverImageUrl } from './cover';

describe('coverImageUrl', () => {
  const url = 'https://cdn.example.com/covers/k7m2xq9p/0123456789abcdef-600.webp';

  it('returns the stored URL for the 600px variant', () => {
    expect(coverImageUrl(url, 600)).toBe(url);
  });

  it('swaps the suffix for the 300px variant', () => {
    expect(coverImageUrl(url, 300)).toBe(
      'https://cdn.example.com/covers/k7m2xq9p/0123456789abcdef-300.webp',
    );
  });

  it('leaves unknown URLs unchanged', () => {
    expect(coverImageUrl('https://x/a.png', 300)).toBe('https://x/a.png');
  });
});
