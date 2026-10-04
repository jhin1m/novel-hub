import { describe, expect, it } from 'vitest';
import { userPreferencesSchema } from './preferences';

describe('userPreferencesSchema', () => {
  it('object rỗng (mặc định trong DB) → showMature tắt', () => {
    expect(userPreferencesSchema.parse({})).toEqual({ showMature: false });
  });

  it('giữ giá trị đã bật', () => {
    expect(userPreferencesSchema.parse({ showMature: true })).toEqual({ showMature: true });
  });

  it('từ chối kiểu sai', () => {
    expect(userPreferencesSchema.safeParse({ showMature: 'yes' }).success).toBe(false);
  });
});
