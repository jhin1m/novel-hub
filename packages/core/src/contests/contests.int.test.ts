import { contestEntries, moderationActions, stories, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import type { ContestInput } from '@novel-hub/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { makeUser } from '../testing/moderation-fixture';
import { makeAuthor, makePublishedStory } from '../testing/story-fixture';
import { createStory } from '../stories/create-story';
import { listContestEntriesForMods, listContestsForMods } from './contest-admin-list';
import { enterContest, listOpenContestsForStory, withdrawEntry } from './contest-entries';
import { createContest, setPlacement, updateContest } from './manage-contests';
import { getContestPage, listContestsPage } from './read-contests';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** A contest input running from `fromMs` to `toMs` around the real clock. */
function input(title: string, fromMs: number, toMs: number): ContestInput {
  const now = Date.now();
  return {
    title,
    description: 'Chủ đề: mùa thu.\nLuật: truyện mới.',
    startsAt: new Date(now + fromMs).toISOString(),
    endsAt: new Date(now + toMs).toISOString(),
  };
}

async function makeContest(title: string, fromMs = -HOUR, toMs = 7 * DAY) {
  const mod = await makeUser(db, `mod_${Math.random().toString(36).slice(2, 8)}`, 'mod');
  const created = await createContest(db, mod, input(title, fromMs, toMs));
  if (!created.ok) throw new Error(created.error);
  return { mod, ...created.value };
}

/** A moment after every contest made here has ended. */
const later = () => new Date(Date.now() + 30 * DAY);

describe('createContest / updateContest', () => {
  it('gives each contest a unique slug and logs it', async () => {
    const mod = await makeUser(db, 'mod', 'mod');
    const a = await createContest(db, mod, input('Mùa Thu', -HOUR, DAY));
    const b = await createContest(db, mod, input('Mùa thu', -HOUR, DAY));
    expect(a.ok && a.value.slug).toBe('mua-thu');
    expect(b.ok && b.value.slug).toBe('mua-thu-2');
    const log = await db.select().from(moderationActions);
    expect(log.map((l) => [l.action, l.targetType, l.modId])).toEqual([
      ['create_contest', 'contest', mod.id],
      ['create_contest', 'contest', mod.id],
    ]);
  });

  it('refuses anyone but an active moderator', async () => {
    const reader = await makeUser(db, 'reader');
    expect(await createContest(db, reader, input('Mùa Thu', -HOUR, DAY))).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
  });

  it('keeps the slug, and fixes the start once a story entered', async () => {
    const { mod, id } = await makeContest('Mùa Thu');
    const renamed = await updateContest(db, mod, id, input('Mùa Đông', -2 * HOUR, DAY));
    expect(renamed).toEqual({ ok: true, value: { slug: 'mua-thu' } });

    const author = await makeAuthor(db);
    const story = await makePublishedStory(db, author, 1);
    expect((await enterContest(db, author, 'mua-thu', story.publicId)).ok).toBe(true);
    expect(await updateContest(db, mod, id, input('Mùa Đông', -3 * HOUR, DAY))).toEqual({
      ok: false,
      error: 'INVALID_STATE',
    });
    // The same start (other fields changed) is still fine.
    const page = await getContestPage(db, 'mua-thu', 1);
    const sameStart = {
      ...input('Mùa Đông 2', 0, 2 * DAY),
      startsAt: page?.contest.startsAt ?? '',
    };
    expect((await updateContest(db, mod, id, sameStart)).ok).toBe(true);
    expect(await db.select().from(moderationActions)).toHaveLength(3);
  });
});

describe('updateContest after places are awarded', () => {
  it('refuses to move the end into the future, until the places are cleared', async () => {
    const { mod, id } = await makeContest('Mùa Thu', -HOUR, DAY);
    const author = await makeAuthor(db);
    const story = await makePublishedStory(db, author, 1);
    await enterContest(db, author, 'mua-thu', story.publicId);
    await setPlacement(db, mod, id, { story: story.publicId, placement: 1 }, later());
    const page = await getContestPage(db, 'mua-thu', 1);
    const reopen = { ...input('Mùa Thu', 0, 2 * DAY), startsAt: page?.contest.startsAt ?? '' };
    expect(await updateContest(db, mod, id, reopen)).toEqual({ ok: false, error: 'INVALID_STATE' });
    // Ended for good (from the moderator's later point of view) is fine.
    expect((await updateContest(db, mod, id, reopen, new Date(Date.now() + 3 * DAY))).ok).toBe(
      true,
    );
    await setPlacement(db, mod, id, { story: story.publicId, placement: null }, later());
    expect((await updateContest(db, mod, id, reopen)).ok).toBe(true);
  });
});

describe('enterContest / withdrawEntry', () => {
  it('enters a new published story once, and withdraws it while open', async () => {
    await makeContest('Mùa Thu');
    const author = await makeAuthor(db);
    const story = await makePublishedStory(db, author, 1);
    expect(await enterContest(db, author, 'mua-thu', story.publicId)).toEqual({
      ok: true,
      value: { entered: true },
    });
    expect((await enterContest(db, author, 'mua-thu', story.publicId)).ok).toBe(true);
    expect(await db.select().from(contestEntries)).toHaveLength(1);
    const open = await listOpenContestsForStory(db, author, story.publicId);
    expect(open.ok && open.value).toEqual([
      expect.objectContaining({ slug: 'mua-thu', entered: true, eligible: true }),
    ]);

    expect((await withdrawEntry(db, author, 'mua-thu', story.publicId)).ok).toBe(true);
    expect(await db.select().from(contestEntries)).toHaveLength(0);
  });

  it('refuses an 18+ story, an older story and one not public with a chapter, with the reason', async () => {
    await makeContest('Mùa Thu');
    const author = await makeAuthor(db);
    const mature = await makePublishedStory(db, author, 1, 'Mười Tám');
    await db.update(stories).set({ isMature: true }).where(eq(stories.id, mature.storyId));
    const old = await makePublishedStory(db, author, 1, 'Truyện Cũ');
    await db
      .update(stories)
      .set({ createdAt: new Date(Date.now() - 2 * HOUR) })
      .where(eq(stories.id, old.storyId));
    const draft = await createStory(db, author, {
      title: 'Bản Nháp',
      synopsis: '',
      mainTag: 'tien-hiep',
      tags: [],
      isMature: false,
      isAiAssisted: false,
    });
    if (!draft.ok) throw new Error(draft.error);

    // Published, but every chapter since deleted: the contest page would never list it.
    const emptied = await makePublishedStory(db, author, 1, 'Hết Chương');
    await db.update(stories).set({ lastChapterAt: null }).where(eq(stories.id, emptied.storyId));

    for (const [publicId, reason] of [
      [emptied.publicId, 'not_published'],
      [mature.publicId, 'mature'],
      [old.publicId, 'too_old'],
      [draft.value.publicId, 'not_published'],
    ] as const) {
      expect(await enterContest(db, author, 'mua-thu', publicId)).toEqual({
        ok: false,
        error: 'CONTEST_STORY_INELIGIBLE',
      });
      const open = await listOpenContestsForStory(db, author, publicId);
      expect(open.ok && open.value[0]).toMatchObject({ eligible: false, reason, entered: false });
    }
  });

  it('is CONTEST_NOT_OPEN before the start and after the end', async () => {
    await makeContest('Sắp Tới', DAY, 2 * DAY);
    await makeContest('Đã Qua', -2 * DAY, -DAY);
    const author = await makeAuthor(db);
    const story = await makePublishedStory(db, author, 1);
    for (const slug of ['sap-toi', 'da-qua']) {
      expect(await enterContest(db, author, slug, story.publicId)).toEqual({
        ok: false,
        error: 'CONTEST_NOT_OPEN',
      });
      expect(await withdrawEntry(db, author, slug, story.publicId)).toEqual({
        ok: false,
        error: 'CONTEST_NOT_OPEN',
      });
    }
    // Neither is open, so the author's panel lists nothing.
    const open = await listOpenContestsForStory(db, author, story.publicId);
    expect(open.ok && open.value).toEqual([]);
  });

  it("answers NOT_FOUND for someone else's story and an unknown contest", async () => {
    await makeContest('Mùa Thu');
    const author = await makeAuthor(db);
    const other = await makeAuthor(db, 'other');
    const story = await makePublishedStory(db, author, 1);
    expect(await enterContest(db, other, 'mua-thu', story.publicId)).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
    expect(await enterContest(db, author, 'khong-co', story.publicId)).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
    expect(await listOpenContestsForStory(db, other, story.publicId)).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
  });
});

describe('setPlacement', () => {
  it('places entries once the contest ended, one story per place, and logs it', async () => {
    const { mod, id } = await makeContest('Mùa Thu', -HOUR, DAY);
    const author = await makeAuthor(db);
    const first = await makePublishedStory(db, author, 1, 'Thứ Nhất');
    const second = await makePublishedStory(db, author, 1, 'Thứ Hai');
    for (const s of [first, second]) await enterContest(db, author, 'mua-thu', s.publicId);

    expect(await setPlacement(db, mod, id, { story: first.publicId, placement: 1 })).toEqual({
      ok: false,
      error: 'INVALID_STATE',
    });
    expect(
      await setPlacement(db, mod, id, { story: first.publicId, placement: 1 }, later()),
    ).toEqual({ ok: true, value: { placement: 1 } });
    expect(
      await setPlacement(db, mod, id, { story: second.publicId, placement: 1 }, later()),
    ).toEqual({ ok: false, error: 'CONTEST_PLACEMENT_TAKEN' });
    expect(
      (await setPlacement(db, mod, id, { story: second.publicId, placement: 2 }, later())).ok,
    ).toBe(true);
    // Clearing frees the place.
    expect(
      (await setPlacement(db, mod, id, { story: first.publicId, placement: null }, later())).ok,
    ).toBe(true);
    expect(
      (await setPlacement(db, mod, id, { story: second.publicId, placement: 1 }, later())).ok,
    ).toBe(true);

    const log = await db
      .select({ action: moderationActions.action, note: moderationActions.note })
      .from(moderationActions)
      .where(eq(moderationActions.action, 'set_contest_placement'));
    expect(log.map((l) => l.note)).toEqual([
      `${first.publicId}: 1`,
      `${second.publicId}: 2`,
      `${first.publicId}: -`,
      `${second.publicId}: 1`,
    ]);
  });

  it("refuses the moderator's own story and a story not entered", async () => {
    const { mod, id } = await makeContest('Mùa Thu', -HOUR, DAY);
    const own = await makePublishedStory(db, mod, 1, 'Của Mod');
    expect((await enterContest(db, mod, 'mua-thu', own.publicId)).ok).toBe(true);
    expect(await setPlacement(db, mod, id, { story: own.publicId, placement: 1 }, later())).toEqual(
      { ok: false, error: 'FORBIDDEN' },
    );
    const author = await makeAuthor(db);
    const outside = await makePublishedStory(db, author, 1);
    expect(
      await setPlacement(db, mod, id, { story: outside.publicId, placement: 1 }, later()),
    ).toEqual({ ok: false, error: 'NOT_FOUND' });
  });
});

describe('contest pages', () => {
  it('lists contests in three groups with their listed entry counts', async () => {
    await makeContest('Đang Mở');
    await makeContest('Sắp Tới', DAY, 2 * DAY);
    await makeContest('Đã Qua', -2 * DAY, -DAY);
    const author = await makeAuthor(db);
    const story = await makePublishedStory(db, author, 1);
    await enterContest(db, author, 'dang-mo', story.publicId);

    const list = await listContestsPage(db);
    expect(list.open.map((c) => [c.slug, c.status, c.entryCount])).toEqual([
      ['dang-mo', 'open', 1],
    ]);
    expect(list.upcoming.map((c) => c.slug)).toEqual(['sap-toi']);
    expect(list.ended.map((c) => c.slug)).toEqual(['da-qua']);
  });

  it('drops entries of a banned author and shows winners only once ended', async () => {
    const { mod, id } = await makeContest('Mùa Thu', -HOUR, DAY);
    const author = await makeAuthor(db);
    const banned = await makeAuthor(db, 'banned_author');
    const kept = await makePublishedStory(db, author, 1, 'Ở Lại');
    const gone = await makePublishedStory(db, banned, 1, 'Bị Khoá');
    await enterContest(db, author, 'mua-thu', kept.publicId);
    await enterContest(db, banned, 'mua-thu', gone.publicId);
    await db.update(users).set({ status: 'banned' }).where(eq(users.id, banned.id));

    const open = await getContestPage(db, 'mua-thu', 1);
    expect(open?.contest).toMatchObject({ status: 'open', entryCount: 1 });
    expect(open?.entries.items.map((s) => s.title)).toEqual(['Ở Lại']);
    expect(open?.winners).toEqual([]);

    await setPlacement(db, mod, id, { story: kept.publicId, placement: 1 }, later());
    const ended = await getContestPage(db, 'mua-thu', 1, later());
    expect(ended?.contest.status).toBe('ended');
    expect(ended?.winners.map((w) => [w.placement, w.story.title])).toEqual([[1, 'Ở Lại']]);
    expect(await getContestPage(db, 'khong-co', 1)).toBeNull();

    const entries = await listContestEntriesForMods(db, mod, id);
    expect(entries.ok && entries.value.map((e) => [e.story.title, e.placement, e.listed])).toEqual([
      ['Ở Lại', 1, true],
      ['Bị Khoá', null, false],
    ]);
    const admin = await listContestsForMods(db, mod);
    expect(admin.ok && admin.value.map((c) => [c.slug, c.entryCount])).toEqual([['mua-thu', 1]]);
  });
});
