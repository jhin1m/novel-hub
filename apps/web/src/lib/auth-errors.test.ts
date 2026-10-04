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
});
