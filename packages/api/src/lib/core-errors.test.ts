import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { type CoreErrorCode, coreError } from './core-errors';

const expected: [CoreErrorCode, number][] = [
  ['NOT_FOUND', 404],
  ['FORBIDDEN', 403],
  ['UNKNOWN_TAG', 422],
  ['MAIN_TAG_NOT_GENRE', 422],
  ['TOO_MANY_TAGS', 422],
  ['IMAGE_TOO_SMALL', 422],
  ['IMAGE_TOO_LARGE', 422],
  ['FILE_TOO_LARGE', 413],
  ['UNSUPPORTED_IMAGE', 415],
  ['UPLOAD_BUSY', 503],
];

describe('coreError', () => {
  it.each(expected)('%s → %i with the standard error body', async (code, status) => {
    const res = await new Hono().get('/', (c) => coreError(c, code)).request('/');
    expect(res.status).toBe(status);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe(code);
    expect(body.error.message.length).toBeGreaterThan(0);
  });
});
