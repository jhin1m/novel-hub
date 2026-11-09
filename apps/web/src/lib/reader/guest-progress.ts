import { type GuestProgressItem, guestProgressItem, isValidPublicId } from '@novel-hub/shared';

export const GUEST_PROGRESS_KEY = 'nh:guest-progress';
/** Set on `<html>` while a guest has saved positions; its own, as a 401 clears the account hint. */
export const GUEST_CONTINUE_ATTRIBUTE = 'data-guest-continue';

const VERSION = 1;
const MAX_STORIES = 5;
const NO_ITEMS: readonly GuestProgressItem[] = [];

/** Keeps the valid entries of a stored value; anything else is dropped on the spot. */
function parseItems(raw: string | null): readonly GuestProgressItem[] {
  if (!raw) return NO_ITEMS;
  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    return NO_ITEMS;
  }
  if (typeof stored !== 'object' || stored === null) return NO_ITEMS;
  const { v, items } = stored as { v?: unknown; items?: unknown };
  if (v !== VERSION || !Array.isArray(items)) return NO_ITEMS;
  const valid = items.flatMap((entry: unknown) => {
    const parsed = guestProgressItem.safeParse(entry);
    return parsed.success && isValidPublicId(parsed.data.publicId) ? [parsed.data] : [];
  });
  return valid.length === 0 ? NO_ITEMS : valid.slice(0, MAX_STORIES);
}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(GUEST_PROGRESS_KEY);
  } catch {
    return null;
  }
}

/** Parsed once per stored string: `useSyncExternalStore` needs a stable value between changes. */
let cachedRaw: string | null = null;
let cachedItems = NO_ITEMS;
const listeners = new Set<() => void>();

/** A guest's saved positions, most recent first. Browser only. */
export function readGuestProgress(): readonly GuestProgressItem[] {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedItems = parseItems(raw);
  }
  return cachedItems;
}

function notify() {
  if (readGuestProgress().length === 0) {
    document.documentElement.removeAttribute(GUEST_CONTINUE_ATTRIBUTE);
  }
  for (const listener of listeners) listener();
}

/** Returns whether the browser kept it. */
function persist(items: readonly GuestProgressItem[]): boolean {
  try {
    if (items.length === 0) window.localStorage.removeItem(GUEST_PROGRESS_KEY);
    else window.localStorage.setItem(GUEST_PROGRESS_KEY, JSON.stringify({ v: VERSION, items }));
    return true;
  } catch {
    return false;
  }
}

/** Records where a guest is in a story, moving the story to the front. */
export function upsertGuestProgress(item: Omit<GuestProgressItem, 'updatedAt'>): void {
  const others = readGuestProgress().filter((saved) => saved.publicId !== item.publicId);
  const saved = persist([{ ...item, updatedAt: Date.now() }, ...others].slice(0, MAX_STORIES));
  if (saved) document.documentElement.setAttribute(GUEST_CONTINUE_ATTRIBUTE, '');
  notify();
}

/**
 * Forgets a story. With `updatedAt`, only that exact save: a position recorded since (another tab,
 * or reading on while a sync runs) is newer than what the caller looked at, and stays.
 */
export function removeGuestProgress(publicId: string, updatedAt?: number): void {
  const items = readGuestProgress();
  const next = items.filter(
    (saved) =>
      saved.publicId !== publicId || (updatedAt !== undefined && saved.updatedAt !== updatedAt),
  );
  if (next.length === items.length) return;
  persist(next);
  notify();
}

function onStorage(event: StorageEvent) {
  if (event.key === GUEST_PROGRESS_KEY || event.key === null) notify();
}

export function subscribeGuestProgress(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener('storage', onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
}
