import { moderationActions, notifications, reports, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { listNotifications } from '../notifications/list-notifications';
import { createReport } from '../reports/create-report';
import { listReports } from '../reports/list-reports';
import { makeUser } from '../testing/moderation-fixture';
import { makeAuthor, makePublishedStory } from '../testing/story-fixture';
import type { CurrentUser } from '../users/current-user';
import { applyModerationAction } from './apply-action';
import { WARNING_RULES, countRecentWarnings } from './recent-warnings';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

const DAY_MS = 86_400_000;

const warn = (actor: CurrentUser, username: string, note: string, reportId?: string) =>
  applyModerationAction(db, actor, { action: 'warn_user', username, note, reportId });

async function reportUser(reporter: CurrentUser, username: string) {
  const filed = await createReport(db, reporter, {
    target: { type: 'user', username },
    reason: 'spam',
  });
  if (!filed.ok) throw new Error(filed.error);
  const [row] = await db.select({ id: reports.id }).from(reports).limit(1);
  if (!row) throw new Error('report missing');
  return row.id;
}

async function warnLog() {
  return db.select().from(moderationActions).where(eq(moderationActions.action, 'warn_user'));
}

describe('warn_user', () => {
  it('logs the warning and notifies the user with the note as reason', async () => {
    const mod = await makeUser(db, 'mod_one', 'mod');
    const target = await makeUser(db, 'spammer');
    expect(await warn(mod, 'spammer', 'Đừng đăng link quảng cáo')).toEqual({
      ok: true,
      value: { action: 'warn_user' },
    });

    const [log] = await warnLog();
    expect(log).toMatchObject({
      modId: mod.id,
      targetType: 'user',
      targetId: target.id,
      note: 'Đừng đăng link quảng cáo',
    });
    const [row] = await db.select().from(notifications);
    expect(row).toMatchObject({
      userId: target.id,
      type: 'user_warned',
      payload: { reason: 'Đừng đăng link quảng cáo' },
      dedupeKey: `warning:${log?.id}`,
    });
    const page = await listNotifications(db, target.id);
    expect(page.items).toEqual([
      expect.objectContaining({ type: 'user_warned', reason: 'Đừng đăng link quảng cáo' }),
    ]);
    // Nothing else changes: no mute, no ban.
    const [user] = await db.select().from(users).where(eq(users.id, target.id));
    expect(user?.status).toBe('active');
  });

  it('keeps two warnings as two unread notifications', async () => {
    const mod = await makeUser(db, 'mod_one', 'mod');
    await makeUser(db, 'spammer');
    await warn(mod, 'spammer', 'Lần một');
    await warn(mod, 'spammer', 'Lần hai');
    expect(await db.select().from(notifications)).toHaveLength(2);
  });

  it('warns once from a report: a retry on the resolved report is refused', async () => {
    const mod = await makeUser(db, 'mod_one', 'mod');
    const reporter = await makeUser(db, 'reader');
    await makeUser(db, 'spammer');
    const reportId = await reportUser(reporter, 'spammer');

    expect((await warn(mod, 'spammer', 'Spam', reportId)).ok).toBe(true);
    expect(await warn(mod, 'spammer', 'Spam', reportId)).toEqual({
      ok: false,
      error: 'INVALID_STATE',
    });
    expect(await warnLog()).toHaveLength(1);
    expect(await db.select().from(notifications)).toHaveLength(1);
    const [report] = await db.select().from(reports);
    expect(report).toMatchObject({ status: 'resolved', handledBy: mod.id });
  });

  it('refuses warning oneself, an admin, a moderator (unless admin) or a banned user', async () => {
    const mod = await makeUser(db, 'mod_one', 'mod');
    const admin = await makeUser(db, 'admin_one', 'admin');
    await makeUser(db, 'mod_two', 'mod');
    const banned = await makeUser(db, 'gone');
    await db.update(users).set({ status: 'banned' }).where(eq(users.id, banned.id));

    expect(await warn(mod, 'mod_one', 'x')).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(await warn(mod, 'admin_one', 'x')).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(await warn(mod, 'mod_two', 'x')).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(await warn(mod, 'gone', 'x')).toEqual({ ok: false, error: 'INVALID_STATE' });
    expect(await warn(mod, 'nobody', 'x')).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect((await warn(admin, 'mod_two', 'x')).ok).toBe(true);
    expect(await warnLog()).toHaveLength(1);
  });

  it('refuses a reader', async () => {
    const reader = await makeUser(db, 'reader');
    await makeUser(db, 'spammer');
    expect(await warn(reader, 'spammer', 'x')).toEqual({ ok: false, error: 'FORBIDDEN' });
  });
});

describe('countRecentWarnings', () => {
  it(`counts the last ${WARNING_RULES.windowDays} days from the log and suggests from ${WARNING_RULES.suggestAt}`, async () => {
    const mod = await makeUser(db, 'mod_one', 'mod');
    await makeUser(db, 'spammer');
    await makeUser(db, 'quiet');
    const now = new Date('2026-10-07T05:00:00Z');
    for (let i = 0; i < 3; i++) await warn(mod, 'spammer', `Lần ${i + 1}`);
    const logs = await warnLog();
    // One warning 91 days old falls out of the window, one 89 days old stays in it.
    await db
      .update(moderationActions)
      .set({ createdAt: new Date(now.getTime() - 91 * DAY_MS) })
      .where(eq(moderationActions.id, logs[0]?.id ?? ''));
    await db
      .update(moderationActions)
      .set({ createdAt: new Date(now.getTime() - 89 * DAY_MS) })
      .where(eq(moderationActions.id, logs[1]?.id ?? ''));
    await db
      .update(moderationActions)
      .set({ createdAt: now })
      .where(eq(moderationActions.id, logs[2]?.id ?? ''));

    expect(await countRecentWarnings(db, ['spammer', 'quiet'], now)).toEqual(
      new Map([['spammer', { count: 2, suggest: false }]]),
    );
    await warn(mod, 'spammer', 'Lần bốn');
    expect((await countRecentWarnings(db, ['spammer'], now)).get('spammer')).toEqual({
      count: 3,
      suggest: true,
    });
    // Pruned notifications do not matter: the count is the log's.
    await db.delete(notifications);
    expect((await countRecentWarnings(db, ['spammer'], now)).get('spammer')?.count).toBe(3);
  });

  it('puts the warnings of the reported accounts on the queue page', async () => {
    const mod = await makeUser(db, 'mod_one', 'mod');
    const reporter = await makeUser(db, 'reader');
    const author = await makeAuthor(db, 'tac_gia');
    const story = await makePublishedStory(db, author, 1);
    await createReport(db, reporter, {
      target: { type: 'story', storyPublicId: story.publicId },
      reason: 'plagiarism',
    });
    for (let i = 0; i < 3; i++) await warn(mod, 'tac_gia', `Lần ${i + 1}`);

    const page = await listReports(db, mod, { status: 'open', page: 1 });
    if (!page.ok) throw new Error(page.error);
    expect(page.value.warnings).toEqual({ tac_gia: { count: 3, suggest: true } });
  });
});
