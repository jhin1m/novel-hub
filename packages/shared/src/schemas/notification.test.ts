import { describe, expect, it } from 'vitest';
import {
  NOTIFICATION_CHAPTER_IDS_MAX,
  markNotificationsReadSchema,
  notificationCursorSchema,
  parseNotification,
} from './notification';

const STORY = '01920000-0000-7000-8000-000000000001';
const CHAPTER = '01920000-0000-7000-8000-000000000002';

describe('parseNotification', () => {
  it('parses a chapter_published row', () => {
    const payload = { storyId: STORY, chapterIds: [CHAPTER], count: 1 };
    expect(parseNotification({ type: 'chapter_published', payload })).toEqual({
      type: 'chapter_published',
      payload,
    });
  });

  it('drops unknown types and payloads that do not parse', () => {
    expect(parseNotification({ type: 'badge_awarded', payload: {} })).toBeNull();
    expect(
      parseNotification({ type: 'chapter_published', payload: { storyId: STORY, count: 1 } }),
    ).toBeNull();
    expect(
      parseNotification({
        type: 'chapter_published',
        payload: {
          storyId: STORY,
          chapterIds: Array.from({ length: NOTIFICATION_CHAPTER_IDS_MAX + 1 }, () => CHAPTER),
          count: 21,
        },
      }),
    ).toBeNull();
  });
});

describe('markNotificationsReadSchema', () => {
  it('accepts ids or all, nothing else', () => {
    expect(markNotificationsReadSchema.parse({ ids: [CHAPTER] })).toEqual({ ids: [CHAPTER] });
    expect(markNotificationsReadSchema.parse({ all: true })).toEqual({ all: true });
    for (const bad of [
      {},
      { ids: [] },
      { ids: ['x'] },
      { all: false },
      { ids: [CHAPTER], all: true },
      { ids: Array.from({ length: 51 }, () => CHAPTER) },
    ]) {
      expect(markNotificationsReadSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('notificationCursorSchema', () => {
  it('accepts only micros_uuid', () => {
    expect(notificationCursorSchema.safeParse(`1759700000000000_${CHAPTER}`).success).toBe(true);
    expect(notificationCursorSchema.safeParse('abc').success).toBe(false);
  });
});
