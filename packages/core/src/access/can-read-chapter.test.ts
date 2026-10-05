import { describe, expect, it } from 'vitest';
import type { UserStatus } from '../policies/user';
import {
  type ReadableChapterFacts,
  canReadChapter,
  isStoryPubliclyVisible,
} from './can-read-chapter';

const readable: ReadableChapterFacts = {
  status: 'published',
  deletedAt: null,
  story: { visibility: 'published', authorStatus: 'active' },
};

function facts(overrides: {
  status?: ReadableChapterFacts['status'];
  deletedAt?: Date | null;
  visibility?: ReadableChapterFacts['story']['visibility'];
  authorStatus?: UserStatus;
}): ReadableChapterFacts {
  return {
    status: overrides.status ?? readable.status,
    deletedAt: overrides.deletedAt === undefined ? readable.deletedAt : overrides.deletedAt,
    story: {
      visibility: overrides.visibility ?? readable.story.visibility,
      authorStatus: overrides.authorStatus ?? readable.story.authorStatus,
    },
  };
}

describe('canReadChapter', () => {
  it('a published chapter of a public story is readable and publicly cacheable', () => {
    expect(canReadChapter(null, readable)).toEqual({ readable: true, publicCache: true });
    expect(canReadChapter(null, facts({ authorStatus: 'muted' }))).toEqual({
      readable: true,
      publicCache: true,
    });
  });

  it('every non-public state is unreadable', () => {
    const cases = [
      facts({ status: 'draft' }),
      facts({ status: 'scheduled' }),
      facts({ status: 'hidden_by_mod' }),
      facts({ deletedAt: new Date() }),
      facts({ visibility: 'draft' }),
      facts({ visibility: 'hidden_by_mod' }),
      facts({ authorStatus: 'banned' }),
    ];
    for (const chapter of cases) {
      expect(canReadChapter(null, chapter)).toEqual({ readable: false });
    }
  });

  it('every combination is readable only when all four conditions hold', () => {
    const statuses = ['draft', 'scheduled', 'published', 'hidden_by_mod'] as const;
    const visibilities = ['draft', 'published', 'hidden_by_mod'] as const;
    const authorStatuses = ['active', 'muted', 'banned'] as const;
    for (const status of statuses) {
      for (const deletedAt of [null, new Date()]) {
        for (const visibility of visibilities) {
          for (const authorStatus of authorStatuses) {
            const expected =
              status === 'published' &&
              deletedAt === null &&
              visibility === 'published' &&
              authorStatus !== 'banned';
            const decision = canReadChapter(
              null,
              facts({ status, deletedAt, visibility, authorStatus }),
            );
            expect(decision.readable).toBe(expected);
          }
        }
      }
    }
  });

  it('the user does not change the decision yet', () => {
    const user = { role: 'admin', status: 'active', emailVerified: true } as const;
    expect(canReadChapter(user, facts({ status: 'draft' }))).toEqual({ readable: false });
    expect(canReadChapter(user, readable)).toEqual({ readable: true, publicCache: true });
  });
});

describe('isStoryPubliclyVisible', () => {
  it('needs a published story by an author who is not banned', () => {
    expect(isStoryPubliclyVisible({ visibility: 'published', authorStatus: 'active' })).toBe(true);
    expect(isStoryPubliclyVisible({ visibility: 'published', authorStatus: 'banned' })).toBe(false);
    expect(isStoryPubliclyVisible({ visibility: 'hidden_by_mod', authorStatus: 'active' })).toBe(
      false,
    );
  });
});
