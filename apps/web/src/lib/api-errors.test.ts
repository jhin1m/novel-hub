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

describe('apiErrorMessage', () => {
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
