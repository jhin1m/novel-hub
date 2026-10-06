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
  ['DRAFT_CONFLICT', 409],
  ['INVALID_DOCUMENT', 422],
  ['DRAFT_TOO_LARGE', 413],
  ['WORD_COUNT_OUT_OF_RANGE', 422],
  ['INVALID_SCHEDULE_TIME', 422],
  ['CHAPTER_HIDDEN_BY_MOD', 409],
  ['ALREADY_PUBLISHED', 409],
  ['NOT_SCHEDULED', 409],
  ['ADULT_CONFIRMATION_REQUIRED', 400],
  ['INVALID_STATE', 409],
  ['USER_MUTED', 403],
  ['COMMENT_PARAGRAPH_INVALID', 422],
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
