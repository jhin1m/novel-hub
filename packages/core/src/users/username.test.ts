import { usernameSchema } from '@novel-hub/shared';
import { describe, expect, it } from 'vitest';
import { generateUsername } from './username';

describe('generateUsername', () => {
  it('lấy phần trước @, luôn kèm hậu tố', () => {
    expect(generateUsername('ducanh@example.com', () => 'k3m9')).toBe('ducanh_k3m9');
  });

  it('bỏ dấu, hạ chữ thường, ký tự lạ thành gạch dưới', () => {
    expect(generateUsername('Đức.Anh+tag@x.vn', () => 'abcd')).toBe('duc_anh_tag_abcd');
  });

  it('local part dài bị cắt, tổng ≤ 30 ký tự', () => {
    const name = generateUsername(`${'a'.repeat(80)}@x.vn`, () => 'abcd');
    expect(name.length).toBeLessThanOrEqual(30);
    expect(name.endsWith('_abcd')).toBe(true);
  });

  it('local part không còn ký tự hợp lệ → dùng "user"', () => {
    expect(generateUsername('...@x.vn', () => 'abcd')).toBe('user_abcd');
    expect(generateUsername('李@x.vn', () => 'abcd')).toBe('user_abcd');
  });

  it('hậu tố ngẫu nhiên thật luôn khớp usernameSchema', () => {
    for (const email of ['a@x.vn', 'Nguyễn Văn A@x.vn', `${'z'.repeat(40)}@x.vn`, '_@x.vn']) {
      const name = generateUsername(email);
      expect(usernameSchema.safeParse(name).success, name).toBe(true);
    }
  });
});
