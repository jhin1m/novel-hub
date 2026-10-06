import type { ReportDto, StoryContext, UserContext } from '@novel-hub/core';
import { describe, expect, it } from 'vitest';
import { actionsFor, canActOn, storyActions, userActions } from './report-actions';

const author: StoryContext['author'] = {
  username: 'lao_mac',
  displayName: 'Lão Mặc',
  role: 'author',
  status: 'active',
};

const story: StoryContext = {
  publicId: 'k7m2xq9p',
  slug: 'kiem-dao-doc-ton',
  title: 'Kiếm Đạo Độc Tôn',
  visibility: 'published',
  author,
};

const mod = { username: 'mod_one', role: 'mod' } as const;
const admin = { username: 'admin_one', role: 'admin' } as const;

function report(target: ReportDto['target'], status: ReportDto['status'] = 'open'): ReportDto {
  return {
    reportId: 'r1',
    reason: 'plagiarism',
    status,
    detail: null,
    createdAt: '2026-10-06T00:00:00.000Z',
    reporter: { username: 'reader' },
    handledBy: null,
    openOnTarget: 1,
    target,
    duplicateOf: null,
  };
}

const names = (actions: { action: string }[]) => actions.map((a) => a.action);

describe('storyActions', () => {
  it('offers hide for a published story and restore for a hidden one', () => {
    expect(storyActions(story)).toEqual([{ action: 'hide_story', storyPublicId: 'k7m2xq9p' }]);
    expect(storyActions({ ...story, visibility: 'hidden_by_mod' })).toEqual([
      { action: 'restore_story', storyPublicId: 'k7m2xq9p' },
    ]);
    expect(storyActions({ ...story, visibility: 'draft' })).toEqual([]);
  });
});

describe('userActions', () => {
  it('follows the account status', () => {
    expect(names(userActions('x', 'active'))).toEqual(['mute_user', 'ban_user']);
    expect(names(userActions('x', 'muted'))).toEqual(['unmute_user', 'ban_user']);
    expect(names(userActions('x', 'banned'))).toEqual(['unban_user']);
    expect(userActions('x', 'banned')).toEqual([{ action: 'unban_user', username: 'x' }]);
  });
});

describe('canActOn', () => {
  const owner = (role: UserContext['role'], username = 'someone') => ({ username, role });

  it('never lets a viewer act on themselves or on an admin', () => {
    expect(canActOn(mod, owner('mod', 'mod_one'))).toBe(false);
    expect(canActOn(admin, owner('admin'))).toBe(false);
    expect(canActOn(mod, owner('admin'))).toBe(false);
  });

  it('lets only an admin act on a moderator', () => {
    expect(canActOn(mod, owner('mod'))).toBe(false);
    expect(canActOn(admin, owner('mod'))).toBe(true);
    expect(canActOn(mod, owner('author'))).toBe(true);
    expect(canActOn(mod, owner('reader'))).toBe(true);
  });
});

describe('actionsFor', () => {
  const chapter = { number: 3, title: null, status: 'published', deleted: false } as const;

  it('offers chapter, story, user and closing actions on an open chapter report', () => {
    const actions = actionsFor(report({ type: 'chapter', story, chapter }), mod);
    expect(actions[0]).toEqual({ action: 'hide_chapter', storyPublicId: 'k7m2xq9p', number: 3 });
    expect(names(actions)).toEqual([
      'hide_chapter',
      'hide_story',
      'mute_user',
      'ban_user',
      'resolve_report',
      'dismiss_report',
    ]);
  });

  it('restores a hidden chapter and skips chapter actions once it is deleted', () => {
    const hidden = actionsFor(
      report({ type: 'chapter', story, chapter: { ...chapter, status: 'hidden_by_mod' } }),
      mod,
    );
    expect(names(hidden)[0]).toBe('restore_chapter');
    const deleted = actionsFor(
      report({ type: 'chapter', story, chapter: { ...chapter, deleted: true } }),
      mod,
    );
    expect(names(deleted)).not.toContain('hide_chapter');
    expect(names(deleted)[0]).toBe('hide_story');
  });

  it('drops the closing actions once the report is handled', () => {
    expect(names(actionsFor(report({ type: 'story', story }, 'resolved'), mod))).toEqual([
      'hide_story',
      'mute_user',
      'ban_user',
    ]);
  });

  it('acts on the user directly for a user report', () => {
    const target = { type: 'user', user: { ...author, displayName: 'Lão Mặc' } } as const;
    expect(names(actionsFor(report(target), mod))).toEqual([
      'mute_user',
      'ban_user',
      'resolve_report',
      'dismiss_report',
    ]);
  });

  it('only closes a report on a moderator’s content when the viewer is a moderator', () => {
    const modStory = { ...story, author: { ...author, username: 'mod_two', role: 'mod' as const } };
    expect(names(actionsFor(report({ type: 'story', story: modStory }), mod))).toEqual([
      'resolve_report',
      'dismiss_report',
    ]);
    expect(names(actionsFor(report({ type: 'story', story: modStory }), admin))).toContain(
      'hide_story',
    );
  });

  it('offers nothing on a report about the viewer’s own content', () => {
    const own = { ...story, author: { ...author, username: 'mod_one', role: 'mod' as const } };
    expect(actionsFor(report({ type: 'story', story: own }), mod)).toEqual([]);
  });

  it('hides or restores a reported comment and acts on its writer', () => {
    const comment = {
      id: '01920000-0000-7000-8000-000000000001',
      excerpt: 'Quảng cáo',
      truncated: false,
      status: 'visible',
      isReply: false,
      writer: { ...author, username: 'spammer', role: 'reader' },
    } as const;
    const target = { type: 'comment', story, chapter, comment } as const;
    const visible = actionsFor(report(target), mod);
    expect(visible[0]).toEqual({ action: 'hide_comment', commentId: comment.id });
    expect(names(visible)).toEqual([
      'hide_comment',
      'mute_user',
      'ban_user',
      'resolve_report',
      'dismiss_report',
    ]);
    const hidden = { ...target, comment: { ...comment, status: 'hidden_by_mod' as const } };
    expect(names(actionsFor(report(hidden), mod))[0]).toBe('restore_comment');
    const deleted = { ...target, comment: { ...comment, status: 'deleted' as const } };
    expect(names(actionsFor(report(deleted), mod))).toEqual([
      'mute_user',
      'ban_user',
      'resolve_report',
      'dismiss_report',
    ]);
  });

  it('offers nothing on a report about the viewer’s own comment', () => {
    const comment = {
      id: '01920000-0000-7000-8000-000000000001',
      excerpt: 'Của mod',
      truncated: false,
      status: 'visible',
      isReply: true,
      writer: { ...author, username: 'mod_one', role: 'mod' },
    } as const;
    expect(actionsFor(report({ type: 'comment', story, chapter, comment }), mod)).toEqual([]);
  });

  it('hides or restores a reported rating, and leaves the viewer’s own alone', () => {
    const rating = {
      id: '01920000-0000-7000-8000-000000000002',
      score: 1,
      excerpt: 'Quảng cáo',
      truncated: false,
      status: 'visible',
      writer: { ...author, username: 'spammer', role: 'reader' },
    } as const;
    const target = { type: 'rating', story, rating } as const;
    const visible = actionsFor(report(target), mod);
    expect(visible[0]).toEqual({ action: 'hide_rating', ratingId: rating.id });
    expect(names(visible)).toEqual([
      'hide_rating',
      'mute_user',
      'ban_user',
      'resolve_report',
      'dismiss_report',
    ]);
    const hidden = { ...target, rating: { ...rating, status: 'hidden_by_mod' as const } };
    expect(names(actionsFor(report(hidden), mod))[0]).toBe('restore_rating');
    const own = { ...target, rating: { ...rating, writer: { ...author, username: 'mod_one' } } };
    expect(actionsFor(report(own), mod)).toEqual([]);
  });

  it('only closes a report whose target is missing', () => {
    expect(names(actionsFor(report({ type: 'missing' }), mod))).toEqual([
      'resolve_report',
      'dismiss_report',
    ]);
  });
});
