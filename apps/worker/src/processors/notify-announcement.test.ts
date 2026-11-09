import type { Db } from '@novel-hub/core';
import { UnrecoverableError } from 'bullmq';
import { describe, expect, it } from 'vitest';
import { processNotifyAnnouncement } from './notify-announcement';

// Never touched: a malformed payload is refused before any query.
const db = {} as Db;

describe('processNotifyAnnouncement', () => {
  it.each([{}, { announcementId: 'x' }, null, 'id'])(
    'never retries a malformed payload %j',
    async (data) => {
      await expect(processNotifyAnnouncement(data, { db })).rejects.toBeInstanceOf(
        UnrecoverableError,
      );
    },
  );
});
