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
    'maps $entity.$action to a purge, a search sync and maybe a fingerprint, without a jobId',
    (change) => {
      const jobs = jobsForChange(change);
      const sync =
        change.entity === 'user'
          ? { kind: 'user', userId: change.userId }
          : { kind: 'story', storyId: change.storyId };
      const fingerprint =
        change.entity === 'chapter' &&
        (change.action === 'published' || change.action === 'updated')
          ? [{ name: 'fingerprint-chapter', data: { chapterId: change.chapterId } }]
          : [];
      expect(jobs).toEqual([
        { name: 'purge-urls', data: change, opts: RETRY_OPTS },
        { name: 'search-sync', data: sync, opts: RETRY_OPTS },
        ...fingerprint,
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

describe('jobsForChange fingerprints', () => {
  const chapter = {
    entity: 'chapter',
    storyId: STORY,
    chapterId: CHAPTER,
    chapterNumber: 1,
  } as const;
  const fingerprintJobs = (change: ContentChange) =>
    jobsForChange(change).filter((job) => job.name === 'fingerprint-chapter');

  it.each(['published', 'updated'] as const)('fingerprints a chapter that was %s', (action) => {
    const jobs = fingerprintJobs({ ...chapter, action, contentHash: 'abc' });
    expect(jobs).toEqual([{ name: 'fingerprint-chapter', data: { chapterId: CHAPTER } }]);
    expect(jobs[0]).not.toHaveProperty('opts');
  });

  it.each(['deleted', 'hidden', 'restored'] as const)(
    'does not fingerprint a %s chapter',
    (action) => {
      expect(fingerprintJobs({ ...chapter, action })).toEqual([]);
    },
  );

  it('never fingerprints story or user changes', () => {
    expect(fingerprintJobs({ entity: 'story', action: 'published', storyId: STORY })).toEqual([]);
    expect(fingerprintJobs({ entity: 'user', action: 'banned', userId: STORY })).toEqual([]);
  });
});
