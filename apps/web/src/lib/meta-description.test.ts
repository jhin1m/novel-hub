import { describe, expect, it } from 'vitest';
import { metaDescription } from './meta-description';

describe('metaDescription', () => {
  it('keeps the first paragraph on one line', () => {
    expect(metaDescription('Dòng một\ncòn tiếp.\n\nĐoạn hai.')).toBe('Dòng một còn tiếp.');
  });

  it('cuts long text at a word boundary to at most 160 characters', () => {
    const text = Array.from({ length: 60 }, () => 'chữ').join(' ');
    const description = metaDescription(text);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(description.endsWith('chữ…')).toBe(true);
  });

  it('falls back to the site description for empty text', () => {
    expect(metaDescription('  \n ')).toBe('Đọc và viết truyện chữ sáng tác gốc tiếng Việt.');
  });
});
