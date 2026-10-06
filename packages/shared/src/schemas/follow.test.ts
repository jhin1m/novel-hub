import { describe, expect, it } from 'vitest';
import { followAuthorParamSchema, followStatusQuerySchema } from './follow';

describe('followStatusQuerySchema', () => {
  it('takes an optional story public id and author username', () => {
    expect(followStatusQuerySchema.parse({})).toEqual({});
    expect(followStatusQuerySchema.parse({ story: 'k7m2xq9p', author: 'lam_phong' })).toEqual({
      story: 'k7m2xq9p',
      author: 'lam_phong',
    });
    expect(followStatusQuerySchema.safeParse({ story: 'not-an-id' }).success).toBe(false);
    expect(followStatusQuerySchema.safeParse({ author: 'Bad Name' }).success).toBe(false);
  });
});

describe('followAuthorParamSchema', () => {
  it('rejects malformed usernames', () => {
    expect(followAuthorParamSchema.safeParse({ username: 'lam_phong' }).success).toBe(true);
    expect(followAuthorParamSchema.safeParse({ username: 'a' }).success).toBe(false);
  });
});
