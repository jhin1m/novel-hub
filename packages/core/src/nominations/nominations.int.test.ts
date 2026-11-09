import { stories, storyNominations, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { makeUser } from '../testing/moderation-fixture';
import { makeAuthor, makePublishedStory } from '../testing/story-fixture';
import type { CurrentUser } from '../users/current-user';
import { updatePreferences } from '../users/preferences';
import { nominateStory } from './nominate-story';
import { getNominationStatus } from './nomination-status';
import { listWeeklyNominations } from './weekly-nominations';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

// A Wednesday; the week (Vietnam time) started on Monday 2026-10-05.
const NOW = new Date('2026-10-07T05:00:00Z');
const DAY_MS = 86_400_000;

/** A verified, active account created `ageDays` before `NOW`. */
async function reader(username: string, ageDays = 30): Promise<CurrentUser> {
  const user = await makeUser(db, username);
  const createdAt = new Date(NOW.getTime() - ageDays * DAY_MS);
  await db.update(users).set({ createdAt }).where(eq(users.id, user.id));
  return { ...user, createdAt };
}

/** `count` published stories by one author; returns their public ids. */
async function storiesBy(username: string, count: number, opts: { isMature?: boolean } = {}) {
  const author = await makeAuthor(db, username);
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    ids.push((await makePublishedStory(db, author, 1, `Truyện ${username} ${i}`, opts)).publicId);
  }
  return { author, ids };
}

async function nominate(actor: CurrentUser, publicId: string, now = NOW) {
  return nominateStory(db, actor, publicId, now);
}

describe('nominateStory', () => {
  it('allows three nominations a week, one per story', async () => {
    const { ids } = await storiesBy('tac_gia', 4);
    const voter = await reader('doc_gia');
    expect(await nominate(voter, ids[0]!)).toEqual({ ok: true, value: { remaining: 2 } });
    expect(await nominate(voter, ids[0]!)).toEqual({ ok: false, error: 'ALREADY_NOMINATED' });
    expect(await nominate(voter, ids[1]!)).toEqual({ ok: true, value: { remaining: 1 } });
    expect(await nominate(voter, ids[2]!)).toEqual({ ok: true, value: { remaining: 0 } });
    expect(await nominate(voter, ids[3]!)).toEqual({
      ok: false,
      error: 'NOMINATION_WEEKLY_LIMIT',
    });
    expect(await nominate(voter, ids[2]!)).toEqual({ ok: false, error: 'ALREADY_NOMINATED' });
  });

  it('resets on Monday 00:00 Vietnam time', async () => {
    const { ids } = await storiesBy('tac_gia', 4);
    const voter = await reader('doc_gia');
    const sundayNight = new Date('2026-10-11T16:59:59Z');
    const monday = new Date('2026-10-11T17:00:00Z');
    for (const id of ids.slice(0, 3))
      expect((await nominate(voter, id, sundayNight)).ok).toBe(true);
    expect(await nominate(voter, ids[3]!, sundayNight)).toEqual({
      ok: false,
      error: 'NOMINATION_WEEKLY_LIMIT',
    });
    expect(await nominate(voter, ids[0]!, monday)).toEqual({ ok: true, value: { remaining: 2 } });
    const weeks = await db
      .select({ weekStart: storyNominations.weekStart })
      .from(storyNominations)
      .where(eq(storyNominations.userId, voter.id));
    expect(new Set(weeks.map((w) => w.weekStart))).toEqual(new Set(['2026-10-05', '2026-10-12']));
  });

  it('never goes over the quota under parallel requests', async () => {
    const { ids } = await storiesBy('tac_gia', 5);
    const voter = await reader('doc_gia');
    const results = await Promise.all(ids.map((id) => nominate(voter, id)));
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(results.filter((r) => !r.ok && r.error === 'NOMINATION_WEEKLY_LIMIT')).toHaveLength(2);
  });

  it('refuses the own story, hidden and 18+ stories, muted and new accounts', async () => {
    const { author, ids } = await storiesBy('tac_gia', 2);
    const mature = (await storiesBy('tac_gia_18', 1, { isMature: true })).ids[0]!;
    const self = { ...(await reader('tac_gia_doc')), id: author.id };
    expect(await nominate(self, ids[0]!)).toEqual({ ok: false, error: 'FORBIDDEN' });

    const voter = await reader('doc_gia');
    expect(await nominate(voter, mature)).toEqual({
      ok: false,
      error: 'MATURE_CONTENT_DISABLED',
    });
    await updatePreferences(db, voter.id, { showMature: true, confirmAdult: true });
    expect((await nominate(voter, mature)).ok).toBe(true);

    await db
      .update(stories)
      .set({ visibility: 'hidden_by_mod' })
      .where(eq(stories.publicId, ids[1]!));
    expect(await nominate(voter, ids[1]!)).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(await nominate(voter, 'zzzzzzzz')).toEqual({ ok: false, error: 'NOT_FOUND' });

    const muted = { ...(await reader('bi_cam')), status: 'muted' as const };
    expect(await nominate(muted, ids[0]!)).toEqual({ ok: false, error: 'USER_MUTED' });
    const young = await reader('moi_tao', 6);
    expect(await nominate(young, ids[0]!)).toEqual({ ok: false, error: 'ACCOUNT_TOO_NEW' });
    const unverified = { ...(await reader('chua_xac_thuc')), emailVerified: false };
    expect(await nominate(unverified, ids[0]!)).toEqual({ ok: false, error: 'FORBIDDEN' });
  });
});

describe('getNominationStatus', () => {
  it('reports what is left, whether the story was nominated and why it cannot be', async () => {
    const { author, ids } = await storiesBy('tac_gia', 2);
    const voter = await reader('doc_gia');
    expect(await getNominationStatus(db, voter, ids[0]!, NOW)).toEqual({
      ok: true,
      value: { remaining: 3, nominated: false, eligibility: 'ok' },
    });
    await nominate(voter, ids[0]!);
    expect(await getNominationStatus(db, voter, ids[0]!, NOW)).toEqual({
      ok: true,
      value: { remaining: 2, nominated: true, eligibility: 'ok' },
    });
    const other = await getNominationStatus(db, voter, ids[1]!, NOW);
    expect(other.ok && other.value.nominated).toBe(false);

    const self = { ...(await reader('tac_gia_doc')), id: author.id };
    const own = await getNominationStatus(db, self, ids[0]!, NOW);
    expect(own.ok && own.value.eligibility).toBe('own_story');
    const young = await getNominationStatus(db, await reader('moi_tao', 6), ids[0]!, NOW);
    expect(young.ok && young.value.eligibility).toBe('too_new');
    const muted = { ...(await reader('bi_cam')), status: 'muted' as const };
    const mutedStatus = await getNominationStatus(db, muted, ids[0]!, NOW);
    expect(mutedStatus.ok && mutedStatus.value.eligibility).toBe('muted');
    expect(await getNominationStatus(db, voter, 'zzzzzzzz', NOW)).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
  });
});

describe('listWeeklyNominations', () => {
  it('ranks this week by votes of active accounts, without 18+ or banned authors', async () => {
    const { ids } = await storiesBy('tac_gia', 3);
    const [a, b, c] = ids as [string, string, string];
    const mature = (await storiesBy('tac_gia_18', 1, { isMature: true })).ids[0]!;
    const banned = await storiesBy('tac_gia_ban', 1);
    const voters = await Promise.all(['voter_1', 'voter_2', 'voter_3'].map((name) => reader(name)));
    const [v1, v2, v3] = voters as [CurrentUser, CurrentUser, CurrentUser];
    for (const voter of voters) {
      await updatePreferences(db, voter.id, { showMature: true, confirmAdult: true });
    }
    const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

    // b reaches two votes before a does; c gets one; last week's votes do not count.
    await nominate(v1, b, at(1));
    await nominate(v2, b, at(2));
    await nominate(v1, a, at(3));
    await nominate(v3, a, at(4));
    await nominate(v2, c, at(5));
    await nominate(v1, mature, at(6));
    await nominate(v2, banned.ids[0]!, at(7));
    await nominate(v3, banned.ids[0]!, at(8));
    await nominate(v3, c, new Date(NOW.getTime() - 7 * DAY_MS));
    await db.update(users).set({ status: 'banned' }).where(eq(users.id, banned.author.id));

    const board = await listWeeklyNominations(db, { now: NOW, limit: 50 });
    expect(board.weekStart).toBe('2026-10-05');
    expect(board.stories.map((s) => s.publicId)).toEqual([b, a, c]);

    // A voter banned afterwards no longer counts: b drops to one vote, behind a.
    await db.update(users).set({ status: 'banned' }).where(eq(users.id, v2.id));
    const after = await listWeeklyNominations(db, { now: NOW, limit: 50 });
    expect(after.stories.map((s) => s.publicId)).toEqual([a, b]);
    expect((await listWeeklyNominations(db, { now: NOW, limit: 1 })).stories).toHaveLength(1);
  });
});
