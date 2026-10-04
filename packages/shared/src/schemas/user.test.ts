import { describe, expect, it } from 'vitest';
import { displayNameSchema, usernameSchema } from './user';

describe('usernameSchema', () => {
  it('nhận chữ thường, số, gạch dưới, 3–30 ký tự', () => {
    for (const value of ['abc', 'lam_phong_99', 'a'.repeat(30)]) {
      expect(usernameSchema.safeParse(value).success, value).toBe(true);
    }
  });

  it('từ chối sai định dạng hoặc độ dài', () => {
    for (const value of ['ab', 'a'.repeat(31), 'Abc', 'lâm', 'a-b', 'a b', '']) {
      expect(usernameSchema.safeParse(value).success, value).toBe(false);
    }
  });

  it('từ chối username hệ thống giữ', () => {
    expect(usernameSchema.safeParse('admin').success).toBe(false);
    expect(usernameSchema.safeParse('novelhub').success).toBe(false);
  });
});

describe('displayNameSchema', () => {
  it('bỏ khoảng trắng hai đầu', () => {
    expect(displayNameSchema.parse('  Lâm Phong  ')).toBe('Lâm Phong');
  });

  it('từ chối rỗng (kể cả chỉ có khoảng trắng) và dài quá 50 ký tự', () => {
    for (const value of ['', '   ', 'a'.repeat(51), 'a'.repeat(200)]) {
      expect(displayNameSchema.safeParse(value).success, value).toBe(false);
    }
  });
});
