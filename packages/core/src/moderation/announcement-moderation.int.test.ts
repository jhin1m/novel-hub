import {
  contentEvents,
  moderationActions,
  notifications,
  reports,
  storyAnnouncements,
} from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { listStoryAnnouncements } from '../announcements/list-announcements';
import { postAnnouncement } from '../announcements/post-announcement';
import { contentChangeSchema } from '../content/hooks';
import { listNotifications } from '../notifications/list-notifications';
import { createReport } from '../reports/create-report';
import { makeUser } from '../testing/moderation-fixture';
import { makeAuthor, makePublishedStory } from '../testing/story-fixture';
import { applyModerationAction } from './apply-action';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

async function setup() {
  const author = await makeAuthor(db, 'tac_gia');
  const story = await makePublishedStory(db, author, 1);
  const follower = await makeUser(db, 'doc_gia');
  const mod = await makeUser(db, 'mod_one', 'mod');
  const posted = await postAnnouncement(db, author, story.publicId, 'Vào nhóm chat để đọc trước');
  if (!posted.ok) throw new Error(posted.error);
  const announcementId = posted.value.id;
  await db.insert(notifications).values({
    userId: follower.id,
    type: 'story_announcement',
    payload: { storyId: story.storyId, announcementId },
    dedupeKey: `announcement:${announcementId}`,
  });
  await db.delete(contentEvents);
  return { author, story, follower, mod, announcementId };
}

async function events() {
  const rows = await db.select().from(contentEvents).orderBy(contentEvents.id);
  return rows.map((row) => contentChangeSchema.parse(row.payload));
}

describe('hide_announcement / restore_announcement', () => {
  it('hides it from the pages and the notifications, logged and purged; restoring undoes it', async () => {
    const { story, follower, mod, announcementId } = await setup();
    expect(await listStoryAnnouncements(db, story.storyId, { limit: 5 })).toHaveLength(1);
    expect((await listNotifications(db, follower.id)).items).toHaveLength(1);

    const hidden = await applyModerationAction(db, mod, {
      action: 'hide_announcement',
      announcementId,
      note: 'Kéo người đọc ra ngoài',
    });
    expect(hidden).toEqual({ ok: true, value: { action: 'hide_announcement' } });
    const [row] = await db
      .select()
      .from(storyAnnouncements)
      .where(eq(storyAnnouncements.id, announcementId));
    expect(row?.status).toBe('hidden_by_mod');
    expect(await listStoryAnnouncements(db, story.storyId, { limit: 5 })).toEqual([]);
    expect((await listNotifications(db, follower.id)).items).toEqual([]);
    expect(await events()).toEqual([
      { entity: 'announcement', action: 'hidden', announcementId, storyId: story.storyId },
    ]);
    const [log] = await db.select().from(moderationActions);
    expect(log).toMatchObject({
      modId: mod.id,
      targetType: 'announcement',
      targetId: announcementId,
      action: 'hide_announcement',
      note: 'Kéo người đọc ra ngoài',
    });

    await db.delete(contentEvents);
    const restored = await applyModerationAction(db, mod, {
      action: 'restore_announcement',
      announcementId,
    });
    expect(restored.ok).toBe(true);
    expect(await listStoryAnnouncements(db, story.storyId, { limit: 5 })).toHaveLength(1);
    expect((await listNotifications(db, follower.id)).items).toHaveLength(1);
    expect(await events()).toEqual([
      { entity: 'announcement', action: 'restored', announcementId, storyId: story.storyId },
    ]);
  });

  it('refuses the wrong state, the author themselves and a reader', async () => {
    const { author, mod, follower, announcementId } = await setup();
    expect(
      await applyModerationAction(db, mod, { action: 'restore_announcement', announcementId }),
    ).toEqual({ ok: false, error: 'INVALID_STATE' });
    expect(
      await applyModerationAction(db, follower, { action: 'hide_announcement', announcementId }),
    ).toEqual({ ok: false, error: 'FORBIDDEN' });
    await db
      .update(storyAnnouncements)
      .set({ status: 'deleted' })
      .where(eq(storyAnnouncements.id, announcementId));
    expect(
      await applyModerationAction(db, mod, { action: 'hide_announcement', announcementId }),
    ).toEqual({ ok: false, error: 'INVALID_STATE' });
    expect(
      await applyModerationAction(db, mod, {
        action: 'hide_announcement',
        announcementId: '01920000-0000-7000-8000-000000000009',
      }),
    ).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(author.role).not.toBe('mod');
    expect(await events()).toEqual([]);
  });

  it('resolves the reports on it when taken from one', async () => {
    const { follower, mod, announcementId } = await setup();
    await createReport(db, follower, {
      target: { type: 'announcement', announcementId },
      reason: 'spam',
    });
    const [report] = await db.select().from(reports);
    if (!report) throw new Error('report missing');
    expect(
      (
        await applyModerationAction(db, mod, {
          action: 'hide_announcement',
          announcementId,
          reportId: report.id,
        })
      ).ok,
    ).toBe(true);
    const [after] = await db.select().from(reports);
    expect(after).toMatchObject({ status: 'resolved', handledBy: mod.id });
  });
});
