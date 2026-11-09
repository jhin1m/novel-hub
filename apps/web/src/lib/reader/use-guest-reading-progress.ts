import { type RefObject, useCallback } from 'react';
import { upsertGuestProgress } from './guest-progress';
import { useScrollCheckpoint } from './use-reading-progress';

/** Saves a guest's position in this browser, on the same schedule as a signed-in reader's. */
export function useGuestReadingProgress(
  content: RefObject<Element | null>,
  chapter: { publicId: string; number: number },
  enabled: boolean,
): void {
  const { publicId, number } = chapter;
  const save = useCallback(
    (scrollPct: number) => upsertGuestProgress({ publicId, number, scrollPct }),
    [publicId, number],
  );
  useScrollCheckpoint(content, enabled, save);
}
