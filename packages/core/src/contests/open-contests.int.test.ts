import { contestEntries, contests } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { makeUser } from '../testing/moderation-fixture';
import { makeAuthor, makePublishedStory } from '../testing/story-fixture';
import { listOpenContests } from './open-contests';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

const NOW = new Date('2026-10-05T12:00:00Z');
const HOUR = 60 * 60 * 1000;
const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR);

/** A contest running from `from` to `to` hours around `NOW`; returns its id. */
async function makeContest(slug: string, from: number, to: number): Promise<string> {
  const mod = await makeUser(db, `mod_${slug.replaceAll('-', '_')}`, 'mod');
  const [row] = await db
    .insert(contests)
    .values({
      slug,
      title: slug,
      description: 'Chủ đề.',
      startsAt: at(from),
      endsAt: at(to),
      createdBy: mod.id,
    })
    .returning({ id: contests.id });
  if (!row) throw new Error('contest insert failed');
  return row.id;
}

describe('listOpenContests', () => {
  it('lists only running contests, ending soonest first, up to the limit', async () => {
    await makeContest('sap-toi', 1, 48);
    await makeContest('da-qua', -48, -1);
    await makeContest('het-dung-luc', -48, 0);
    await makeContest('con-lau', -1, 72);
    await makeContest('sap-het', -1, 2);
    await makeContest('vua-mo', 0, 24);

    const open = await listOpenContests(db, NOW);
    expect(open.map((c) => [c.slug, c.status])).toEqual([
      ['sap-het', 'open'],
      ['vua-mo', 'open'],
    ]);
    const all = await listOpenContests(db, NOW, 10);
    expect(all.map((c) => c.slug)).toEqual(['sap-het', 'vua-mo', 'con-lau']);
  });

  it('counts only listed entries: no 18+ story, no story without chapters', async () => {
    const id = await makeContest('mua-thu', -1, 24);
    const author = await makeAuthor(db);
    const listed = await makePublishedStory(db, author, 1, 'Được Liệt Kê');
    const mature = await makePublishedStory(db, author, 1, 'Mười Tám', { isMature: true });
    const empty = await makePublishedStory(db, author, 0, 'Chưa Có Chương');
    await db
      .insert(contestEntries)
      .values([listed, mature, empty].map((s) => ({ contestId: id, storyId: s.storyId })));

    const [contest] = await listOpenContests(db, NOW);
    expect(contest).toEqual({
      slug: 'mua-thu',
      title: 'mua-thu',
      startsAt: at(-1).toISOString(),
      endsAt: at(24).toISOString(),
      status: 'open',
      entryCount: 1,
    });
  });

  it('returns nothing when no contest is running', async () => {
    await makeContest('da-qua', -48, -1);
    expect(await listOpenContests(db, NOW)).toEqual([]);
  });
});
