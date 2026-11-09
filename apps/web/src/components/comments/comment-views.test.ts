import type { CommentThreadDto } from '@novel-hub/core';
import { describe, expect, it } from 'vitest';
import { composerView, feedThreads } from './comment-views';

const thread = (id: string, pinnedAt: string | null = null): CommentThreadDto => ({
  id,
  body: `Bình luận ${id}`,
  createdAt: '2026-10-07T00:00:00.000Z',
  author: { username: 'doc_gia', displayName: 'Độc Giả' },
  isOwn: false,
  pinnedAt,
  editedAt: null,
  orphanedParagraph: false,
  replyCount: 0,
  replies: [],
  moreRepliesCursor: null,
});

describe('composerView', () => {
  it('waits for the session, then asks a guest to sign in', () => {
    expect(composerView(true, undefined)).toBe('pending');
    expect(composerView(false, null)).toBe('guest');
  });

  it('gives the form only to an active account with a verified email', () => {
    expect(composerView(false, { status: 'muted', emailVerified: true })).toBe('muted');
    expect(composerView(false, { status: 'active', emailVerified: false })).toBe('unverified');
    expect(composerView(false, { status: 'active', emailVerified: true })).toBe('form');
  });
});

describe('feedThreads', () => {
  it('is empty before anything loaded or when nobody posted', () => {
    expect(feedThreads([])).toEqual({ threads: [], total: null, canPin: false });
    expect(feedThreads([{ total: 0, pinned: [], items: [], viewerCanPin: false }]).threads).toEqual(
      [],
    );
  });

  it('lists the pinned threads first, then every page in order', () => {
    const pinned = thread('p', '2026-10-07T01:00:00.000Z');
    const result = feedThreads([
      { total: 3, pinned: [pinned], items: [thread('a')], viewerCanPin: true },
      { total: null, pinned: [], items: [thread('b')], viewerCanPin: true },
    ]);
    expect(result.threads.map((t) => t.id)).toEqual(['p', 'a', 'b']);
    expect(result).toMatchObject({ total: 3, canPin: true });
  });

  it('lists a thread unpinned while paging only once', () => {
    const result = feedThreads([
      {
        total: 2,
        pinned: [thread('p', '2026-10-07T01:00:00.000Z')],
        items: [],
        viewerCanPin: false,
      },
      { total: null, pinned: [], items: [thread('p'), thread('a')], viewerCanPin: false },
    ]);
    expect(result.threads.map((t) => t.id)).toEqual(['p', 'a']);
  });
});
