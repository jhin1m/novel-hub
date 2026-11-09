import {
  DEFAULT_SITE_THEME,
  type SiteThemeChoice,
  type SiteThemeSettings,
} from '@novel-hub/shared';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useMe } from '../me';
import { usePatchPreferences } from '../preferences';
import { pickNewer } from '../reader/settings';
import {
  SITE_THEME_KEY,
  applySiteTheme,
  readLocalSiteTheme,
  writeLocalSiteTheme,
} from './site-theme';

/** `window.localStorage` itself throws when site data is blocked. */
function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The site theme, one copy per browser tab. Loaded lazily from localStorage on the client only;
 * the server snapshot is always the default, so hydration never mismatches (the boot script
 * already painted the stored theme).
 */
let snapshot: SiteThemeSettings | null = null;
const listeners = new Set<() => void>();

/** Another tab changed the theme: reload it so this tab shows and keeps the same choice. */
function onStorage(event: StorageEvent) {
  if (event.key !== SITE_THEME_KEY && event.key !== null) return;
  snapshot = null;
  applySiteTheme(document.documentElement, getSnapshot().choice);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    window.addEventListener('storage', onStorage);
    reloadMissedChange();
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
}

/**
 * While nothing listened (e.g. the account sync unmounts as sign-in resets the account), `storage`
 * events from other tabs went unheard: re-read the stored choice so the kept snapshot is not stale.
 * The same choice keeps the old object, so React does not re-render for nothing.
 */
function reloadMissedChange() {
  if (!snapshot) return;
  const storage = browserStorage();
  // Nothing readable keeps the current choice: storage that refused the write must not undo it.
  const stored = storage ? readLocalSiteTheme(storage) : null;
  if (!stored || (stored.choice === snapshot.choice && stored.updatedAt === snapshot.updatedAt)) {
    return;
  }
  const previous = snapshot;
  snapshot = stored;
  if (stored.choice !== previous.choice) applySiteTheme(document.documentElement, stored.choice);
}

function getSnapshot(): SiteThemeSettings {
  if (!snapshot) {
    const storage = browserStorage();
    snapshot = (storage && readLocalSiteTheme(storage)) ?? DEFAULT_SITE_THEME;
  }
  return snapshot;
}

function getServerSnapshot(): SiteThemeSettings {
  return DEFAULT_SITE_THEME;
}

/** The store behind both hooks; exported for tests only. */
export const siteThemeStore = { subscribe, getSnapshot, getServerSnapshot };

/** Applies to `<html>` at once and stores the choice for the next page's boot script. */
function commit(next: SiteThemeSettings) {
  snapshot = next;
  applySiteTheme(document.documentElement, next.choice);
  const storage = browserStorage();
  if (storage) writeLocalSiteTheme(storage, next);
  for (const listener of listeners) listener();
}

/**
 * The site theme choice and a setter for pickers. A new choice applies at once, is stored
 * locally and, for signed-in readers, uploaded right away (one click, nothing to debounce).
 * Reconciling with the server copy is `useSiteThemeSync`'s job, not this hook's.
 */
export function useSiteTheme() {
  const settings = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const { mutate: patchPreferences } = usePatchPreferences();
  const signedIn = Boolean(useMe().data);

  const update = useCallback(
    (choice: SiteThemeChoice) => {
      const next = { choice, updatedAt: Date.now() };
      commit(next);
      // A failed upload is not retried here: the local copy stays newer, so the next page view
      // uploads it again.
      if (signedIn) patchPreferences({ siteTheme: next });
    },
    [patchPreferences, signedIn],
  );

  return { choice: settings.choice, update };
}

/**
 * Reconciles the local choice with `users.preferences.siteTheme` once the account is known: the
 * more recently changed copy wins (server newer → apply and store locally; local newer → upload).
 * Also keeps the `storage` listener alive on every page (guests included), so a choice made in
 * another tab applies here even when no picker is mounted.
 * Mount exactly once, at the app root: a second mount would upload twice.
 */
export function useSiteThemeSync(): void {
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const { mutate: patchPreferences } = usePatchPreferences();
  const me = useMe();
  const signedIn = Boolean(me.data);
  const serverSettings = me.data?.preferences.siteTheme ?? null;

  useEffect(() => {
    if (!signedIn) return;
    const storage = browserStorage();
    const local = storage ? readLocalSiteTheme(storage) : null;
    const newer = pickNewer(local, serverSettings);
    if (newer === 'server' && serverSettings) commit(serverSettings);
    else if (newer === 'local' && local) patchPreferences({ siteTheme: local });
  }, [signedIn, serverSettings, patchPreferences]);
}
