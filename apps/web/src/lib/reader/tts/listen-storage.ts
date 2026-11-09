import { createChapterHandoff } from '../resume-handoff';

/** Speeds offered by the player. */
export const LISTEN_RATES = [0.8, 1, 1.25, 1.5, 2] as const;
const DEFAULT_RATE = 1;

const KEY = 'nh:listen';

type RateStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function isListenRate(value: unknown): value is number {
  return typeof value === 'number' && (LISTEN_RATES as readonly number[]).includes(value);
}

/** The speed the reader chose last on this device. */
export function readListenRate(storage?: RateStorage): number {
  try {
    const raw = (storage ?? window.localStorage).getItem(KEY);
    const rate: unknown = raw === null ? null : (JSON.parse(raw) as { rate?: unknown }).rate;
    return isListenRate(rate) ? rate : DEFAULT_RATE;
  } catch {
    return DEFAULT_RATE;
  }
}

export function saveListenRate(rate: number, storage?: RateStorage): void {
  try {
    (storage ?? window.localStorage).setItem(KEY, JSON.stringify({ rate }));
  } catch {
    // Storage blocked: the speed lasts for this page only.
  }
}

/** Listening goes on in the next chapter: handed over the full page load in `sessionStorage`. */
export const listenHandoff = createChapterHandoff(KEY, (value): value is { rate: number } =>
  isListenRate((value as { rate?: unknown }).rate),
);
