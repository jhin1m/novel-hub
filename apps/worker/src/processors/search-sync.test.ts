import type { Db, SearchCtx } from '@novel-hub/core';
import { UnrecoverableError } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { createSearchWriter, processSearchSync } from './search-sync';

const db = {} as Db;
const names = { stories: 't_stories', authors: 't_authors' };

/** A client whose `getIndex` follows `getIndex`, and whose settings tasks always succeed. */
function fakeCtx(getIndex: () => Promise<unknown>): SearchCtx {
  const succeeded = { waitTask: () => Promise.resolve({ status: 'succeeded', error: null }) };
  const client = { getIndex, index: () => ({ updateSettings: () => succeeded }) };
  return { client: client as unknown as SearchCtx['client'], names };
}

describe('processSearchSync', () => {
  it('never retries a malformed payload', async () => {
    await expect(
      processSearchSync({ kind: 'story', storyId: 'x' }, { db, search: null }),
    ).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('skips the job when search is not configured', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(
      processSearchSync(
        { kind: 'user', userId: '01920000-0000-7000-8000-000000000001' },
        { db, search: null },
      ),
    ).resolves.toBeUndefined();
  });
});

describe('createSearchWriter', () => {
  it('applies settings once, and tries again after a failure', async () => {
    const getIndex = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('meilisearch down'))
      .mockResolvedValue({});
    const writer = createSearchWriter(fakeCtx(getIndex));

    await expect(writer.ensureReady()).rejects.toThrow('meilisearch down');
    await writer.ensureReady();
    await writer.ensureReady();
    // One failed attempt, then one successful run over both indexes, then cached.
    expect(getIndex).toHaveBeenCalledTimes(3);
  });
});
