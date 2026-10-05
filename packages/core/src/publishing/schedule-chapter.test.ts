import { describe, expect, it } from 'vitest';
import { chapterDeleteChanges, chapterPublishChanges } from './changes';
import { validateScheduleTime } from './schedule-chapter';

const NOW = new Date('2026-10-05T00:00:00Z');
const later = (ms: number) => new Date(NOW.getTime() + ms);
const MINUTE = 60_000;
const DAY = 86_400_000;

describe('validateScheduleTime', () => {
  it('accepts 5 minutes to 365 days ahead', () => {
    expect(validateScheduleTime(later(4 * MINUTE), NOW)).toBe(false);
    expect(validateScheduleTime(later(5 * MINUTE), NOW)).toBe(true);
    expect(validateScheduleTime(later(60 * MINUTE), NOW)).toBe(true);
    expect(validateScheduleTime(later(365 * DAY), NOW)).toBe(true);
    expect(validateScheduleTime(later(366 * DAY), NOW)).toBe(false);
    expect(validateScheduleTime(later(-MINUTE), NOW)).toBe(false);
  });
});

describe('chapter change builders', () => {
  const target = { storyId: 's', chapterId: 'c', chapterNumber: 3 };

  it('marks the first publish, an update and a story going public', () => {
    expect(
      chapterPublishChanges(target, { firstPublish: true, contentHash: 'h', storyPublished: true }),
    ).toEqual([
      { entity: 'chapter', action: 'published', ...target, contentHash: 'h' },
      { entity: 'story', action: 'published', storyId: 's' },
    ]);
    expect(
      chapterPublishChanges(target, {
        firstPublish: false,
        contentHash: 'h',
        storyPublished: false,
      }),
    ).toEqual([{ entity: 'chapter', action: 'updated', ...target, contentHash: 'h' }]);
    expect(chapterDeleteChanges(target)).toEqual([
      { entity: 'chapter', action: 'deleted', ...target },
    ]);
  });
});
