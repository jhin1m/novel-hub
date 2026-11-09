import type { GuestProgressItem } from '@novel-hub/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { getGuestContinue } from '../server-fns/reading';
import { createApiClient } from './api-client';
import { historyQueryKey } from './library';
import { useMe } from './me';
import { readGuestProgress, removeGuestProgress } from './reader/guest-progress';

const api = createApiClient();

export interface GuestSyncSteps {
  /** Whether the saved chapter can still be read and the story is not 18+. */
  isReadable: (item: GuestProgressItem) => Promise<boolean>;
  /** The chapter the account is at in this story, `null` if it never read it. */
  accountChapter: (publicId: string) => Promise<number | null>;
  /** Writes the position to the account; answers the HTTP status. */
  put: (item: GuestProgressItem) => Promise<number>;
  remove: (item: GuestProgressItem) => void;
}

/**
 * Moves a guest's positions into the account, oldest first so the latest ends up on top of the
 * history. The write endpoint overwrites and each story has one row, so a position only goes in
 * when the account never read the story or is at an earlier chapter: chapter numbers need no clock
 * and can never move a reader backwards. Any failure that says nothing about the position keeps
 * everything for the next page load. Answers whether anything was written.
 */
export async function syncGuestProgress(
  items: readonly GuestProgressItem[],
  steps: GuestSyncSteps,
): Promise<boolean> {
  let wrote = false;
  try {
    for (const item of [...items].reverse()) {
      if (!(await steps.isReadable(item))) {
        steps.remove(item);
        continue;
      }
      const accountChapter = await steps.accountChapter(item.publicId);
      if (accountChapter !== null && item.number <= accountChapter) {
        steps.remove(item);
        continue;
      }
      const status = await steps.put(item);
      if (status === 401 || status === 429 || status >= 500) return wrote;
      wrote ||= status === 204;
      steps.remove(item);
    }
  } catch {
    // Network or server trouble: everything not handled yet stays for the next page load.
  }
  return wrote;
}

const STEPS: GuestSyncSteps = {
  isReadable: async ({ publicId, number }) =>
    (await getGuestContinue({ data: { publicId, number } })) !== null,
  accountChapter: async (publicId) => {
    const res = await api.api.v1.reading.progress[':publicId'].$get({ param: { publicId } });
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error('GET /api/v1/reading/progress failed');
    }
    return (await res.json()).progress?.chapterNumber ?? null;
  },
  put: async ({ publicId, number, scrollPct }) => {
    const res = await api.api.v1.reading.progress.$put({ json: { publicId, number, scrollPct } });
    await res.body?.cancel();
    return res.status;
  },
  remove: ({ publicId, updatedAt }) => removeGuestProgress(publicId, updatedAt),
};

/** Once per sign-in, moves what this browser read as a guest into the account. Mount once. */
export function useGuestProgressSync(): void {
  const queryClient = useQueryClient();
  const signedIn = Boolean(useMe().data);
  const synced = useRef(false);

  useEffect(() => {
    if (!signedIn) {
      synced.current = false;
      return;
    }
    if (synced.current) return;
    synced.current = true;
    const items = readGuestProgress();
    if (items.length === 0) return;
    void syncGuestProgress(items, STEPS).then((wrote) => {
      if (wrote) void queryClient.invalidateQueries({ queryKey: historyQueryKey });
    });
  }, [signedIn, queryClient]);
}
