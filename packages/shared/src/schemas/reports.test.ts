import { describe, expect, it } from 'vitest';
import {
  MODERATION_ACTIONS,
  moderationActionSchema,
  reportCreateSchema,
  reportListQuerySchema,
} from './reports';

const reportId = '01920000-0000-7000-8000-000000000001';

describe('reportCreateSchema', () => {
  it('accepts each target by its public key', () => {
    for (const target of [
      { type: 'story', storyPublicId: 'k7m2xq9p' },
      { type: 'chapter', storyPublicId: 'k7m2xq9p', number: 3 },
      { type: 'user', username: 'lam_phong' },
    ]) {
      expect(reportCreateSchema.safeParse({ target, reason: 'spam' }).success).toBe(true);
    }
  });

  it('rejects internal ids, missing fields, the automatic reason and long details', () => {
    const story = { type: 'story', storyPublicId: 'k7m2xq9p' };
    for (const body of [
      { target: { type: 'story', storyId: reportId }, reason: 'spam' },
      { target: { type: 'chapter', storyPublicId: 'k7m2xq9p' }, reason: 'spam' },
      { target: { type: 'comment', id: reportId }, reason: 'spam' },
      { target: story, reason: 'duplicate' },
      { target: story },
      { target: story, reason: 'spam', detail: 'x'.repeat(1_001) },
    ]) {
      expect(reportCreateSchema.safeParse(body).success, JSON.stringify(body)).toBe(false);
    }
  });

  it('trims the detail', () => {
    const target = { type: 'user', username: 'lam_phong' };
    expect(reportCreateSchema.parse({ target, reason: 'spam', detail: '  ' }).detail).toBe('');
    expect(reportCreateSchema.parse({ target, reason: 'spam', detail: ' a ' }).detail).toBe('a');
  });
});

describe('moderationActionSchema', () => {
  it('accepts one shape per action', () => {
    const bodies = [
      { action: 'hide_story', storyPublicId: 'k7m2xq9p', reportId },
      { action: 'restore_story', storyPublicId: 'k7m2xq9p' },
      { action: 'hide_chapter', storyPublicId: 'k7m2xq9p', number: 1, note: 'copy' },
      { action: 'restore_chapter', storyPublicId: 'k7m2xq9p', number: 1 },
      { action: 'mute_user', username: 'lam_phong' },
      { action: 'unmute_user', username: 'lam_phong' },
      { action: 'ban_user', username: 'lam_phong' },
      { action: 'unban_user', username: 'lam_phong' },
      { action: 'merge_tag', sourceSlug: 'tien-hiep-2', targetSlug: 'tien-hiep' },
      { action: 'dismiss_report', reportId },
      { action: 'resolve_report', reportId },
    ];
    expect(bodies.map((b) => b.action)).toEqual([...MODERATION_ACTIONS]);
    for (const body of bodies) {
      expect(moderationActionSchema.safeParse(body).success, body.action).toBe(true);
    }
  });

  it('rejects unknown actions, missing fields and long notes', () => {
    for (const body of [
      { action: 'delete_story', storyPublicId: 'k7m2xq9p' },
      { action: 'hide_chapter', storyPublicId: 'k7m2xq9p' },
      { action: 'ban_user' },
      { action: 'merge_tag', sourceSlug: 'a' },
      { action: 'dismiss_report', reportId: 'not-a-uuid' },
      { action: 'ban_user', username: 'lam_phong', note: 'x'.repeat(501) },
    ]) {
      expect(moderationActionSchema.safeParse(body).success, JSON.stringify(body)).toBe(false);
    }
  });
});

describe('reportListQuerySchema', () => {
  it('defaults to the open queue and falls back on bad values', () => {
    expect(reportListQuerySchema.parse({})).toEqual({ status: 'open', page: 1 });
    expect(reportListQuerySchema.parse({ status: 'gone', reason: 'nope', page: '-1' })).toEqual({
      status: 'open',
      reason: undefined,
      page: 1,
    });
    expect(
      reportListQuerySchema.parse({ status: 'dismissed', reason: 'duplicate', page: '3' }),
    ).toEqual({ status: 'dismissed', reason: 'duplicate', page: 3 });
  });
});
