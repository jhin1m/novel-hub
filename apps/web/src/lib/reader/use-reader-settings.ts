import { DEFAULT_READER_SETTINGS, type ReaderSettings } from '@novel-hub/shared';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { useMe } from '../me';
import { usePatchPreferences } from '../preferences';
import {
  READER_SETTINGS_KEY,
  applyReaderSettings,
  pickNewer,
  readLocalSettings,
  writeLocalSettings,
} from './settings';

/** Uploads wait for the reader to stop dragging a slider. */
const UPLOAD_DEBOUNCE_MS = 1000;

export type ReaderSettingsChange = Partial<Omit<ReaderSettings, 'updatedAt'>>;

/** `window.localStorage` itself throws when site data is blocked. */
function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The page's settings, one copy per browser tab. Loaded lazily from localStorage on the client
 * only; the server snapshot is always the defaults, so hydration never mismatches (the boot
 * script already painted the stored settings).
 */
let snapshot: ReaderSettings | null = null;
const listeners = new Set<() => void>();

/** Another tab changed the settings: reload them so this tab never writes back a stale copy. */
function onStorage(event: StorageEvent) {
  if (event.key !== READER_SETTINGS_KEY && event.key !== null) return;
  snapshot = null;
  applyReaderSettings(document.documentElement, getSnapshot());
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener('storage', onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
}

function getSnapshot(): ReaderSettings {
  if (!snapshot) {
    const storage = browserStorage();
    snapshot = (storage && readLocalSettings(storage)) ?? DEFAULT_READER_SETTINGS;
  }
  return snapshot;
}

function getServerSnapshot(): ReaderSettings {
  return DEFAULT_READER_SETTINGS;
}

/** Applies to `<html>` at once and stores the settings for the next page's boot script. */
function commit(next: ReaderSettings) {
  snapshot = next;
  applyReaderSettings(document.documentElement, next);
  const storage = browserStorage();
  if (storage) writeLocalSettings(storage, next);
  for (const listener of listeners) listener();
}

/**
 * Reader settings, kept in localStorage and, for signed-in readers, synced with
 * `users.preferences.reader`: the more recently changed copy wins.
 */
export function useReaderSettings() {
  const settings = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const uploadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { mutate: patchPreferences } = usePatchPreferences();
  const me = useMe();
  const signedIn = Boolean(me.data);
  const serverSettings = me.data?.preferences.reader ?? null;

  const upload = useCallback(
    (next: ReaderSettings) => {
      clearTimeout(uploadTimer.current);
      // A failed upload is not retried here: the local copy stays newer, so the next page view
      // uploads it again.
      uploadTimer.current = setTimeout(
        () => patchPreferences({ reader: next }),
        UPLOAD_DEBOUNCE_MS,
      );
    },
    [patchPreferences],
  );

  useEffect(() => () => clearTimeout(uploadTimer.current), []);

  useEffect(() => {
    if (!signedIn) return;
    const storage = browserStorage();
    const local = storage ? readLocalSettings(storage) : null;
    const newer = pickNewer(local, serverSettings);
    if (newer === 'server' && serverSettings) commit(serverSettings);
    else if (newer === 'local' && local) upload(local);
  }, [signedIn, serverSettings, upload]);

  const update = useCallback(
    (change: ReaderSettingsChange) => {
      const next = { ...getSnapshot(), ...change, updatedAt: Date.now() };
      commit(next);
      if (signedIn) upload(next);
    },
    [upload, signedIn],
  );

  const reset = useCallback(() => {
    update({ ...DEFAULT_READER_SETTINGS, theme: undefined });
  }, [update]);

  return { settings, update, reset };
}
