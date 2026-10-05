import type { Db } from '@novel-hub/core';
import { UnrecoverableError } from 'bullmq';
import { describe, expect, it } from 'vitest';
import { processFingerprintChapter } from './fingerprint-chapter';

describe('processFingerprintChapter', () => {
  it('never retries a malformed payload and never touches the database', async () => {
    const db = new Proxy({} as Db, {
      get: () => {
        throw new Error('database touched');
      },
    });
    for (const data of [null, {}, { chapterId: 'not-a-uuid' }]) {
      await expect(processFingerprintChapter(data, { db })).rejects.toBeInstanceOf(
        UnrecoverableError,
      );
    }
  });
});
