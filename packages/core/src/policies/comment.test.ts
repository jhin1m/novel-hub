import { describe, expect, it } from 'vitest';
import { canPinComment } from './comment';
import type { PolicyUser } from './user';

const story = { authorId: 'author' };
const user = (id: string, status: PolicyUser['status']) => ({ id, status });

describe('canPinComment', () => {
  it('lets the active author of the story pin', () => {
    expect(canPinComment(user('author', 'active'), story)).toBe(true);
  });

  it('refuses a muted or banned author', () => {
    expect(canPinComment(user('author', 'muted'), story)).toBe(false);
    expect(canPinComment(user('author', 'banned'), story)).toBe(false);
  });

  it('refuses anyone else', () => {
    expect(canPinComment(user('reader', 'active'), story)).toBe(false);
  });
});
