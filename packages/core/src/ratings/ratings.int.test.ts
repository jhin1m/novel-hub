import { moderationActions, ratings, reports, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { REVIEWS_PAGE_SIZE, type ModerationActionInput } from '@novel-hub/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { applyModerationAction } from '../moderation/apply-action';
import { createReport } from '../reports/create-report';
import { listReports } from '../reports/list-reports';
import { makeUser } from '../testing/moderation-fixture';
import { makePublishedStory } from '../testing/story-fixture';
import type { CurrentUser } from '../users/current-user';
import { deleteRating } from './delete-rating';
import { listStoryRatings } from './list-ratings';
import { getMyRating } from './my-rating';
import { upsertRating } from './upsert-rating';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

async function setup() {
  const author = await makeUser(db, 'tac_gia');
  const story = await makePublishedStory(db, author, 1);
  const reader = await makeUser(db, 'doc_gia');
  const other = await makeUser(db, 'doc_gia_hai');
  const admin = await makeUser(db, 'quan_tri', 'admin');
  return { author, story, reader, other, admin, publicId: story.publicId };
}

async function rate(actor: CurrentUser, publicId: string, score: number, review: string | null) {
  const result = await upsertRating(db, actor, { publicId, score, review });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

async function page(publicId: string, viewer: CurrentUser | null = null, cursor?: string) {
  const result = await listStoryRatings(db, viewer, { publicId, cursor });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

async function ratingIdOf(user: CurrentUser): Promise<string> {
  const [row] = await db
    .select({ id: ratings.id })
    .from(ratings)
    .where(eq(ratings.userId, user.id));
  if (!row) throw new Error('no rating');
  return row.id;
}

const act = (actor: CurrentUser, input: ModerationActionInput) =>
  applyModerationAction(db, actor, input);

describe('ratings', () => {
  it('creates, edits and summarises ratings, listing only those with a review', async () => {
    const { author, reader, other, publicId } = await setup();
    const first = await rate(reader, publicId, 4, 'Truyện hay');
    expect(first).toMatchObject({ score: 4, review: 'Truyện hay', status: 'visible' });
    await rate(other, publicId, 2, null);

    const one = await page(publicId, reader);
    expect(one.summary).toEqual({
      count: 2,
      average: 3,
      distribution: { 1: 0, 2: 1, 3: 0, 4: 1, 5: 0 },
    });
    expect(one.reviews).toHaveLength(1);
    expect(one.reviews[0]).toMatchObject({
      score: 4,
      review: 'Truyện hay',
      author: { username: 'doc_gia', displayName: 'Name doc_gia' },
      isOwn: true,
    });
    expect(JSON.stringify(one)).not.toContain(reader.id);
    expect((await page(publicId)).reviews[0]?.isOwn).toBe(false);

    const edited = await rate(reader, publicId, 5, null);
    expect(edited.createdAt).toBe(first.createdAt);
    expect(edited.updatedAt >= first.updatedAt).toBe(true);
    const two = await page(publicId);
    expect(two.summary).toMatchObject({ count: 2, average: 3.5 });
    expect(two.reviews).toEqual([]);
    expect(await getMyRating(db, reader.id, publicId)).toMatchObject({ score: 5, review: null });
    expect(await getMyRating(db, author.id, publicId)).toBeNull();
  });

  it('rounds the average to one decimal and starts empty', async () => {
    const { reader, other, admin, publicId } = await setup();
    expect((await page(publicId)).summary).toEqual({
      count: 0,
      average: null,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    });
    await rate(reader, publicId, 5, null);
    await rate(other, publicId, 4, null);
    await rate(admin, publicId, 4, null);
    expect((await page(publicId)).summary?.average).toBe(4.3);
  });

  it('pages reviews most recently updated first with a keyset cursor', async () => {
    const { publicId } = await setup();
    for (let i = 0; i < REVIEWS_PAGE_SIZE + 2; i++) {
      await rate(await makeUser(db, `nguoi_doc_${i}`), publicId, 3, `Review ${i}`);
    }
    const one = await page(publicId);
    expect(one.reviews).toHaveLength(REVIEWS_PAGE_SIZE);
    expect(one.reviews[0]?.review).toBe(`Review ${REVIEWS_PAGE_SIZE + 1}`);
    expect(one.nextCursor).not.toBeNull();
    const two = await page(publicId, null, one.nextCursor ?? undefined);
    expect(two.summary).toBeNull();
    expect(two.reviews.map((r) => r.review)).toEqual(['Review 1', 'Review 0']);
    expect(two.nextCursor).toBeNull();
  });

  it('leaves banned writers out of the summary and the reviews', async () => {
    const { reader, other, publicId } = await setup();
    await rate(reader, publicId, 5, 'Hay');
    await rate(other, publicId, 1, 'Dở');
    await db.update(users).set({ status: 'banned' }).where(eq(users.id, other.id));
    const result = await page(publicId);
    expect(result.summary).toMatchObject({ count: 1, average: 5 });
    expect(result.reviews.map((r) => r.review)).toEqual(['Hay']);
  });

  it('refuses the author, muted and unverified accounts, and stories nobody can rate', async () => {
    const { author, reader, other, admin, publicId } = await setup();
    expect(await upsertRating(db, author, { publicId, score: 5, review: null })).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect(
      await upsertRating(db, { ...reader, status: 'muted' }, { publicId, score: 5, review: null }),
    ).toEqual({ ok: false, error: 'USER_MUTED' });
    expect(
      await upsertRating(
        db,
        { ...other, emailVerified: false },
        { publicId, score: 5, review: null },
      ),
    ).toEqual({ ok: false, error: 'FORBIDDEN' });

    // A story without a published chapter yet, and a hidden one.
    const empty = await makePublishedStory(db, author, 0, 'Chưa có chương');
    expect(
      await upsertRating(db, reader, { publicId: empty.publicId, score: 5, review: null }),
    ).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(await listStoryRatings(db, null, { publicId: empty.publicId })).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
    expect((await act(admin, { action: 'hide_story', storyPublicId: publicId })).ok).toBe(true);
    expect(await upsertRating(db, reader, { publicId, score: 5, review: null })).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
    expect(await listStoryRatings(db, null, { publicId })).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
  });

  it('deletes only the reader’s own rating', async () => {
    const { reader, other, publicId } = await setup();
    await rate(reader, publicId, 4, 'Hay');
    expect(await deleteRating(db, other, publicId)).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(await deleteRating(db, reader, publicId)).toEqual({ ok: true, value: undefined });
    expect(await getMyRating(db, reader.id, publicId)).toBeNull();
    expect((await page(publicId)).summary?.count).toBe(0);
  });
});

describe('rating moderation', () => {
  it('reports a review, hides it from the report, and keeps it hidden through edit and delete', async () => {
    const { reader, other, publicId } = await setup();
    const mod = await makeUser(db, 'kiem_duyet', 'mod');
    const written = await rate(other, publicId, 1, 'Spam spam '.repeat(40));
    const ratingId = await ratingIdOf(other);
    expect(
      await createReport(db, reader, { target: { type: 'rating', ratingId }, reason: 'spam' }),
    ).toEqual({ ok: true, value: { created: true } });

    const queue = await listReports(db, mod, { status: 'open', page: 1 });
    if (!queue.ok) throw new Error(queue.error);
    const [item] = queue.value.items;
    expect(item?.target).toMatchObject({
      type: 'rating',
      story: { publicId },
      rating: { id: ratingId, score: 1, status: 'visible', truncated: true },
    });
    if (item?.target.type !== 'rating') throw new Error('not a rating target');
    expect(item.target.rating.writer.username).toBe('doc_gia_hai');

    expect(await act(mod, { action: 'hide_rating', ratingId, reportId: item.reportId })).toEqual({
      ok: true,
      value: { action: 'hide_rating' },
    });
    const [report] = await db.select().from(reports);
    expect(report?.status).toBe('resolved');
    expect(await db.select().from(moderationActions)).toMatchObject([
      { action: 'hide_rating', targetType: 'rating', targetId: ratingId },
    ]);
    expect(await page(publicId)).toMatchObject({ summary: { count: 0 }, reviews: [] });
    expect(await getMyRating(db, other.id, publicId)).toMatchObject({ status: 'hidden_by_mod' });

    // Neither editing nor deleting and rating again brings it back.
    expect(await upsertRating(db, other, { publicId, score: 5, review: 'Mới' })).toEqual({
      ok: false,
      error: 'RATING_HIDDEN',
    });
    expect(await deleteRating(db, other, publicId)).toEqual({
      ok: false,
      error: 'RATING_HIDDEN',
    });
    expect(await getMyRating(db, other.id, publicId)).toMatchObject({
      status: 'hidden_by_mod',
      score: 1,
    });
    // A hidden rating can no longer be reported; restoring brings it back.
    expect(
      await createReport(db, reader, { target: { type: 'rating', ratingId }, reason: 'spam' }),
    ).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(await act(mod, { action: 'hide_rating', ratingId })).toEqual({
      ok: false,
      error: 'INVALID_STATE',
    });
    expect((await act(mod, { action: 'restore_rating', ratingId })).ok).toBe(true);
    expect((await page(publicId)).summary?.count).toBe(1);
    // A moderator's hide and restore are not edits: the review keeps its place and date.
    expect(await getMyRating(db, other.id, publicId)).toMatchObject({
      updatedAt: written.updatedAt,
    });
  });

  it('keeps moderators off their own ratings and off those of admins', async () => {
    const { reader, admin, publicId } = await setup();
    const mod = await makeUser(db, 'kiem_duyet', 'mod');
    await rate(mod, publicId, 5, 'Của mod');
    await rate(admin, publicId, 5, 'Của admin');
    const own = await ratingIdOf(mod);
    const byAdmin = await ratingIdOf(admin);
    expect(await act(mod, { action: 'hide_rating', ratingId: own })).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect(await act(mod, { action: 'hide_rating', ratingId: byAdmin })).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });

    await createReport(db, reader, { target: { type: 'rating', ratingId: own }, reason: 'spam' });
    const [report] = await db.select().from(reports);
    expect(await act(mod, { action: 'dismiss_report', reportId: report?.id ?? '' })).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect((await act(admin, { action: 'hide_rating', ratingId: own })).ok).toBe(true);
  });
});
