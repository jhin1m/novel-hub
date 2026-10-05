import { describe, expect, it } from 'vitest';
import { type StoryActor, canEditChapter, canEditStory } from './story';

const author: StoryActor = { id: 'a', role: 'author', status: 'active', emailVerified: true };

describe('canEditStory', () => {
  it('allows the author', () => {
    expect(canEditStory(author, { authorId: 'a' })).toBe(true);
  });

  it('denies other users, mods and admins included', () => {
    expect(canEditStory({ ...author, id: 'b' }, { authorId: 'a' })).toBe(false);
    expect(canEditStory({ ...author, id: 'b', role: 'admin' }, { authorId: 'a' })).toBe(false);
  });

  it('denies a banned author', () => {
    expect(canEditStory({ ...author, status: 'banned' }, { authorId: 'a' })).toBe(false);
  });
});

describe('canEditChapter', () => {
  it('follows story ownership', () => {
    expect(canEditChapter(author, { authorId: 'a' })).toBe(true);
    expect(canEditChapter({ ...author, id: 'b' }, { authorId: 'a' })).toBe(false);
    expect(canEditChapter({ ...author, status: 'banned' }, { authorId: 'a' })).toBe(false);
  });
});
