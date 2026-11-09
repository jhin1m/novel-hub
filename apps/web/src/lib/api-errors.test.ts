import { describe, expect, it } from 'vitest';
import { ApiError, apiErrorMessage, readApiError } from './api-errors';

describe('readApiError', () => {
  it('reads the code from the standard error body', async () => {
    const res = Response.json(
      { error: { code: 'IMAGE_TOO_SMALL', message: 'x' } },
      { status: 422 },
    );
    const error = await readApiError(res);
    expect(error).toBeInstanceOf(ApiError);
    expect([error.status, error.code]).toEqual([422, 'IMAGE_TOO_SMALL']);
  });

  it('keeps only the status when the body is not JSON', async () => {
    const error = await readApiError(new Response('<html>Bad gateway</html>', { status: 502 }));
    expect([error.status, error.code]).toEqual([502, undefined]);
  });
});

describe('readApiError on 429', () => {
  it('keeps the Retry-After seconds', async () => {
    const res = Response.json(
      { error: { code: 'RATE_LIMITED', message: 'x' } },
      { status: 429, headers: { 'Retry-After': '3600' } },
    );
    const error = await readApiError(res);
    expect([error.status, error.code, error.retryAfterSec]).toEqual([429, 'RATE_LIMITED', 3600]);
  });
});

describe('apiErrorMessage', () => {
  it('tells how many minutes to wait when rate limited', () => {
    expect(apiErrorMessage(new ApiError(429, 'RATE_LIMITED', 3600))).toBe(
      'Bạn thao tác quá nhanh, hãy thử lại sau 60 phút.',
    );
    expect(apiErrorMessage(new ApiError(429, 'RATE_LIMITED'))).toBe(
      'Bạn thao tác quá nhanh, hãy thử lại sau ít phút.',
    );
  });

  it('maps known codes and falls back to the generic message', () => {
    expect(apiErrorMessage(new ApiError(415, 'UNSUPPORTED_IMAGE'))).toBe(
      'Chỉ nhận ảnh JPG, PNG hoặc WebP.',
    );
    expect(apiErrorMessage(new ApiError(500, 'INTERNAL_ERROR'))).toBe(
      'Có lỗi xảy ra, vui lòng thử lại.',
    );
    expect(apiErrorMessage(new Error('network'))).toBe('Có lỗi xảy ra, vui lòng thử lại.');
  });
});

describe('apiErrorMessage for pins, announcements, nominations and imports', () => {
  it.each([
    ['COMMENT_PIN_LIMIT', 409, 'Chỉ ghim được tối đa 3 bình luận'],
    ['COMMENT_UNDER_REVIEW', 409, 'Bình luận đang được ban kiểm duyệt xem xét'],
    ['ANNOUNCEMENT_DAILY_LIMIT', 429, 'Mỗi truyện chỉ đăng tối đa 3 thông báo mỗi ngày.'],
    ['NOMINATION_WEEKLY_LIMIT', 409, 'Bạn đã dùng hết 3 phiếu đề cử tuần này.'],
    ['ALREADY_NOMINATED', 409, 'Bạn đã đề cử truyện này trong tuần.'],
    ['ACCOUNT_TOO_NEW', 403, 'Tài khoản cần ít nhất 7 ngày tuổi'],
    ['CHAPTER_IMPORT_INVALID', 422, 'Có chương chưa hợp lệ'],
  ])('%s has its own message', (code, status, text) => {
    expect(apiErrorMessage(new ApiError(status, code))).toContain(text);
  });
});
