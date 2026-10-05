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
