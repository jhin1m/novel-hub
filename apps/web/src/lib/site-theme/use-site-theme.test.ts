import { DEFAULT_SITE_THEME, type SiteThemeSettings } from '@novel-hub/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SITE_THEME_KEY } from './site-theme';

// The store does not use the account hooks; mocking them keeps the API and auth clients out of
// the per-test module reload.
vi.mock('../me', () => ({ useMe: () => ({ data: undefined }) }));
vi.mock('../preferences', () => ({ usePatchPreferences: () => ({ mutate: () => {} }) }));

/** A browser stand-in: localStorage, `storage` listeners and `<html>` attributes. */
function fakeBrowser() {
  const items = new Map<string, string>();
  const storageListeners = new Set<(event: StorageEvent) => void>();
  const attributes: Record<string, string> = {};
  const window = {
    localStorage: {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
    },
    addEventListener: (type: string, listener: (event: StorageEvent) => void) => {
      if (type === 'storage') storageListeners.add(listener);
    },
    removeEventListener: (type: string, listener: (event: StorageEvent) => void) => {
      if (type === 'storage') storageListeners.delete(listener);
    },
  };
  const document = {
    documentElement: {
      setAttribute: (name: string, value: string) => void (attributes[name] = value),
      removeAttribute: (name: string) => void delete attributes[name],
    },
  };
  return {
    window,
    document,
    attributes,
    storageListeners,
    clearStorage: () => items.clear(),
    /** Another tab writes the theme; the event only reaches listeners attached right now. */
    writeFromOtherTab(settings: SiteThemeSettings) {
      items.set(SITE_THEME_KEY, JSON.stringify(settings));
      for (const listener of storageListeners) listener({ key: SITE_THEME_KEY } as StorageEvent);
    },
  };
}

let browser: ReturnType<typeof fakeBrowser>;

/** A fresh module per test: the store keeps its snapshot at module level. */
async function loadStore() {
  vi.resetModules();
  return (await import('./use-site-theme')).siteThemeStore;
}

beforeEach(() => {
  browser = fakeBrowser();
  vi.stubGlobal('window', browser.window);
  vi.stubGlobal('document', browser.document);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('siteThemeStore', () => {
  it('renders the default on the server', async () => {
    const store = await loadStore();
    expect(store.getServerSnapshot()).toEqual(DEFAULT_SITE_THEME);
  });

  it('applies and announces a choice made in another tab', async () => {
    const store = await loadStore();
    const listener = vi.fn();
    store.subscribe(listener);

    browser.writeFromOtherTab({ choice: 'dark', updatedAt: 10 });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toEqual({ choice: 'dark', updatedAt: 10 });
    expect(browser.attributes['data-theme']).toBe('dark');
  });

  it('re-reads a change missed while nothing listened once subscribed again', async () => {
    browser.writeFromOtherTab({ choice: 'ivory', updatedAt: 1 });
    const store = await loadStore();
    const unsubscribe = store.subscribe(() => {});
    expect(store.getSnapshot().choice).toBe('ivory');
    unsubscribe();
    expect(browser.storageListeners.size).toBe(0);

    browser.writeFromOtherTab({ choice: 'dark', updatedAt: 2 });
    store.subscribe(() => {});

    expect(store.getSnapshot()).toEqual({ choice: 'dark', updatedAt: 2 });
    expect(browser.attributes['data-theme']).toBe('dark');
  });

  it('keeps the current choice when nothing readable is stored any more', async () => {
    browser.writeFromOtherTab({ choice: 'dark', updatedAt: 1 });
    const store = await loadStore();
    const unsubscribe = store.subscribe(() => {});
    expect(store.getSnapshot().choice).toBe('dark');
    unsubscribe();

    browser.clearStorage();
    store.subscribe(() => {});

    expect(store.getSnapshot()).toEqual({ choice: 'dark', updatedAt: 1 });
  });

  it('keeps the same snapshot object when nothing changed meanwhile', async () => {
    browser.writeFromOtherTab({ choice: 'ivory', updatedAt: 1 });
    const store = await loadStore();
    const unsubscribe = store.subscribe(() => {});
    const before = store.getSnapshot();
    unsubscribe();

    store.subscribe(() => {});

    expect(store.getSnapshot()).toBe(before);
  });
});
