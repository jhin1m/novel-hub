import { describe, expect, it } from 'vitest';
import { type ContentChange, contentChangeSchema, jobsForChange } from './hooks';

const STORY = '01920000-0000-7000-8000-000000000001';
const CHAPTER = '01920000-0000-7000-8000-000000000002';

const CHANGES: ContentChange[] = [
  { entity: 'story', action: 'published', storyId: STORY },
  { entity: 'story', action: 'updated', storyId: STORY, previousSlug: 'ten-cu' },
  {
    entity: 'chapter',
    action: 'published',
    storyId: STORY,
    chapterId: CHAPTER,
    chapterNumber: 1,
    contentHash: 'abc',
  },
  { entity: 'chapter', action: 'deleted', storyId: STORY, chapterId: CHAPTER, chapterNumber: 2 },
  { entity: 'user', action: 'banned', userId: STORY },
];

describe('contentChangeSchema', () => {
  it.each(CHANGES)('accepts $entity.$action', (change) => {
    expect(contentChangeSchema.parse(change)).toEqual(change);
  });

  it('rejects unknown entities, actions and malformed ids', () => {
    for (const bad of [
      { entity: 'comment', action: 'updated', storyId: STORY },
      { entity: 'story', action: 'archived', storyId: STORY },
      { entity: 'story', action: 'updated', storyId: 'not-a-uuid' },
      { entity: 'chapter', action: 'updated', storyId: STORY, chapterId: CHAPTER },
    ]) {
      expect(contentChangeSchema.safeParse(bad).success).toBe(false);
    }
  });
});

const RETRY_OPTS = { attempts: 11, backoff: { type: 'exponential', delay: 10_000 } };

describe('jobsForChange', () => {
  it.each(CHANGES)(
    'maps $entity.$action to a purge and a search sync, without a jobId',
    (change) => {
      const jobs = jobsForChange(change);
      const sync =
        change.entity === 'user'
          ? { kind: 'user', userId: change.userId }
          : { kind: 'story', storyId: change.storyId };
      expect(jobs).toEqual([
        { name: 'purge-urls', data: change, opts: RETRY_OPTS },
        { name: 'search-sync', data: sync, opts: RETRY_OPTS },
      ]);
      for (const job of jobs) {
        expect(job).not.toHaveProperty('jobId');
        expect(job.opts ?? {}).not.toHaveProperty('jobId');
      }
    },
  );

  it('maps every user action to a user sync', () => {
    for (const action of ['updated', 'banned', 'unbanned'] as const) {
      const [, sync] = jobsForChange({ entity: 'user', action, userId: STORY });
      expect(sync?.data).toEqual({ kind: 'user', userId: STORY });
    }
  });
});
