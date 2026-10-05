import { m } from '@novel-hub/shared/messages';
import { describe, expect, it } from 'vitest';
import { AuthClientError, authErrorMessage } from './auth-errors';

describe('authErrorMessage', () => {
  it('mã đã biết → chuỗi tương ứng', () => {
    expect(authErrorMessage({ code: 'USERNAME_TAKEN' })).toBe(m.error_username_taken());
    expect(authErrorMessage({ code: 'INVALID_EMAIL_OR_PASSWORD' })).toBe(
      m.error_invalid_credentials(),
    );
  });

  it('đọc được mã từ AuthClientError', () => {
    expect(authErrorMessage(new AuthClientError({ code: 'ACCOUNT_BANNED' }))).toBe(
      m.error_account_banned(),
    );
  });

  it('mã lạ, thiếu mã hoặc không phải object → câu chung', () => {
    for (const error of [{ code: 'KHONG_BIET' }, {}, null, undefined, new Error('x'), 'chuỗi']) {
      expect(authErrorMessage(error)).toBe(m.error_generic());
    }
  });

  it('rate limited → the wait in whole minutes, read from the error body', () => {
    expect(authErrorMessage({ code: 'RATE_LIMITED', retryAfterSec: 900 })).toBe(
      'Bạn thao tác quá nhanh, hãy thử lại sau 15 phút.',
    );
    expect(authErrorMessage(new AuthClientError({ code: 'RATE_LIMITED', retryAfterSec: 30 }))).toBe(
      'Bạn thao tác quá nhanh, hãy thử lại sau 1 phút.',
    );
    expect(authErrorMessage({ code: 'RATE_LIMITED' })).toBe(m.error_rate_limited());
  });
});
