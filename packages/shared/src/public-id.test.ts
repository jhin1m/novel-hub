import { describe, expect, it } from 'vitest';
import { PUBLIC_ID_ALPHABET, generatePublicId, isValidPublicId } from './public-id';

describe('generatePublicId', () => {
  it('sinh 8 ký tự thuộc bảng chữ cho phép, không chứa ký tự dễ nhầm', () => {
    for (let i = 0; i < 10_000; i++) {
      const id = generatePublicId();
      expect(id).toHaveLength(8);
      expect(isValidPublicId(id)).toBe(true);
      expect(id).not.toMatch(/[0o1li]/);
    }
  });

  it('dùng được mọi ký tự trong bảng chữ', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2_000; i++) for (const ch of generatePublicId()) seen.add(ch);
    expect(seen.size).toBe(PUBLIC_ID_ALPHABET.length);
  });
});

describe('isValidPublicId', () => {
  it('chấp nhận mã hợp lệ', () => {
    expect(isValidPublicId('k7m2xq9p')).toBe(true);
  });

  it('từ chối độ dài sai', () => {
    expect(isValidPublicId('k7m2xq9')).toBe(false);
    expect(isValidPublicId('k7m2xq9pa')).toBe(false);
    expect(isValidPublicId('')).toBe(false);
  });

  it('từ chối chữ hoa và ký tự cấm', () => {
    expect(isValidPublicId('K7M2XQ9P')).toBe(false);
    for (const banned of ['0', 'o', '1', 'l', 'i']) {
      expect(isValidPublicId(`k7m2xq9${banned}`)).toBe(false);
    }
    expect(isValidPublicId('k7m2-q9p')).toBe(false);
  });
});
