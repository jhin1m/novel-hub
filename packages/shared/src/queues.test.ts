import { describe, expect, it } from 'vitest';
import { sendAuthEmailPayload } from './queues';

const valid = {
  kind: 'verify',
  to: 'an@example.com',
  displayName: 'An',
  url: 'http://localhost:3000/api/auth/verify-email?token=abc',
};

describe('sendAuthEmailPayload', () => {
  it('payload hợp lệ → parse được', () => {
    expect(sendAuthEmailPayload.parse(valid)).toEqual(valid);
    expect(sendAuthEmailPayload.parse({ ...valid, kind: 'reset' }).kind).toBe('reset');
  });

  it.each([
    ['kind lạ', { ...valid, kind: 'welcome' }],
    ['email sai', { ...valid, to: 'khong-phai-email' }],
    ['url sai', { ...valid, url: 'khong-phai-url' }],
    ['thiếu displayName', { kind: valid.kind, to: valid.to, url: valid.url }],
  ])('%s → lỗi', (_label, input) => {
    expect(sendAuthEmailPayload.safeParse(input).success).toBe(false);
  });
});
