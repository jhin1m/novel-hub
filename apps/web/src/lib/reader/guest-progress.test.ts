import type { GuestProgressItem } from '@novel-hub/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GUEST_PROGRESS_KEY } from './guest-progress';

/** A browser stand-in: localStorage, `storage` listeners and `<html>` attributes. */
function fakeBrowser() {
  const items = new Map<string, string>();
  const storageListeners = new Set<(event: StorageEvent) => void>();
  const attributes: Record<string, string> = {};
  return {
    items,
    attributes,
    storageListeners,
    window: {
      localStorage: {
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => void items.set(key, value),
        removeItem: (key: string) => void items.delete(key),
      },
      addEventListener: (type: string, listener: (event: StorageEvent) => void) => {
        if (type === 'storage') storageListeners.add(listener);
      },
      removeEventListener: (type: string, listener: (event: StorageEvent) => void) => {
        if (type === 'storage') storageListeners.delete(listener);
      },
    },
    document: {
      documentElement: {
        setAttribute: (name: string, value: string) => void (attributes[name] = value),
        removeAttribute: (name: string) => void delete attributes[name],
      },
    },
  };
}

let browser: ReturnType<typeof fakeBrowser>;

/** A fresh module per test: the store keeps its parsed copy at module level. */
async function loadStore() {
  vi.resetModules();
  return import('./guest-progress');
}

const id = (letter: string) => letter.repeat(8);
const item = (letter: string, updatedAt = 1): GuestProgressItem => ({
  publicId: id(letter),
  number: 2,
  scrollPct: 30,
  updatedAt,
});
const store = (entries: unknown[]) =>
  browser.items.set(GUEST_PROGRESS_KEY, JSON.stringify({ v: 1, items: entries }));

beforeEach(() => {
  browser = fakeBrowser();
  vi.stubGlobal('window', browser.window);
  vi.stubGlobal('document', browser.document);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('reading', () => {
  it.each([
    ['nothing stored', undefined],
    ['broken JSON', '{broken'],
    ['a list', '[1]'],
    ['another version', '{"v":2,"items":[]}'],
    ['items not a list', '{"v":1,"items":{}}'],
    ['null', 'null'],
  ])('%s reads as empty', async (_, raw) => {
    if (raw !== undefined) browser.items.set(GUEST_PROGRESS_KEY, raw);
    const { readGuestProgress } = await loadStore();
    expect(readGuestProgress()).toEqual([]);
  });

  it('drops only the malformed entries', async () => {
    store([
      item('a'),
      { ...item('b'), scrollPct: 900 },
      { ...item('c'), number: 2_147_483_648 },
      { ...item('d'), publicId: 'has space' },
      'nonsense',
      item('e'),
    ]);
    const { readGuestProgress } = await loadStore();
    expect(readGuestProgress().map((saved) => saved.publicId)).toEqual([id('a'), id('e')]);
  });

  it('never returns more than the limit, whatever is stored', async () => {
    store(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((letter) => item(letter)));
    const { readGuestProgress } = await loadStore();
    expect(readGuestProgress()).toHaveLength(5);
  });

  it('keeps the same array until the stored value changes', async () => {
    store([item('a')]);
    const { readGuestProgress, upsertGuestProgress } = await loadStore();
    const first = readGuestProgress();
    expect(readGuestProgress()).toBe(first);
    upsertGuestProgress({ publicId: id('b'), number: 1, scrollPct: 0 });
    expect(readGuestProgress()).not.toBe(first);
  });

  it('reads as empty when storage is blocked', async () => {
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new Error('blocked');
      },
    });
    const { readGuestProgress } = await loadStore();
    expect(readGuestProgress()).toEqual([]);
  });
});

describe('writing', () => {
  it('puts the latest story first and updates it in place', async () => {
    const { readGuestProgress, upsertGuestProgress } = await loadStore();
    upsertGuestProgress({ publicId: id('a'), number: 1, scrollPct: 10 });
    upsertGuestProgress({ publicId: id('b'), number: 1, scrollPct: 20 });
    upsertGuestProgress({ publicId: id('a'), number: 2, scrollPct: 30 });

    expect(readGuestProgress().map((saved) => [saved.publicId, saved.number])).toEqual([
      [id('a'), 2],
      [id('b'), 1],
    ]);
  });

  it('cuts the oldest story past five', async () => {
    const { readGuestProgress, upsertGuestProgress } = await loadStore();
    for (const letter of ['a', 'b', 'c', 'd', 'e', 'f']) {
      upsertGuestProgress({ publicId: id(letter), number: 1, scrollPct: 0 });
    }
    expect(readGuestProgress().map((saved) => saved.publicId)).toEqual(
      ['f', 'e', 'd', 'c', 'b'].map(id),
    );
  });

  it('survives storage refusing the write, and does not claim a position exists', async () => {
    const { upsertGuestProgress } = await loadStore();
    browser.window.localStorage.setItem = () => {
      throw new Error('quota');
    };
    expect(() => upsertGuestProgress({ publicId: id('a'), number: 1, scrollPct: 0 })).not.toThrow();
    expect(browser.attributes).toEqual({});
  });

  it('marks <html> on a save and clears the mark with the last position', async () => {
    const { removeGuestProgress, upsertGuestProgress } = await loadStore();
    upsertGuestProgress({ publicId: id('a'), number: 1, scrollPct: 0 });
    upsertGuestProgress({ publicId: id('b'), number: 1, scrollPct: 0 });
    expect(browser.attributes).toEqual({ 'data-guest-continue': '' });

    removeGuestProgress(id('a'));
    expect(browser.attributes).toEqual({ 'data-guest-continue': '' });
    removeGuestProgress(id('b'));
    expect(browser.attributes).toEqual({});
    expect(browser.items.has(GUEST_PROGRESS_KEY)).toBe(false);
  });

  it('removing the first story shows the next one to listeners, no reload needed', async () => {
    store([item('a'), item('b')]);
    const { readGuestProgress, removeGuestProgress, subscribeGuestProgress } = await loadStore();
    const seen: (string | undefined)[] = [];
    subscribeGuestProgress(() => seen.push(readGuestProgress()[0]?.publicId));

    removeGuestProgress(id('a'));

    expect(seen).toEqual([id('b')]);
  });

  it('keeps a position saved after the one being removed', async () => {
    store([item('a', 200)]);
    const { readGuestProgress, removeGuestProgress } = await loadStore();
    removeGuestProgress(id('a'), 100);
    expect(readGuestProgress()).toHaveLength(1);
    removeGuestProgress(id('a'), 200);
    expect(readGuestProgress()).toEqual([]);
  });

  it('removing a story that is not there notifies nobody', async () => {
    store([item('a')]);
    const { removeGuestProgress, subscribeGuestProgress } = await loadStore();
    const listener = vi.fn();
    subscribeGuestProgress(listener);
    removeGuestProgress(id('z'));
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('other tabs', () => {
  it('picks up a change and drops the mark when the list empties', async () => {
    store([item('a')]);
    browser.attributes['data-guest-continue'] = '';
    const { readGuestProgress, subscribeGuestProgress } = await loadStore();
    const listener = vi.fn();
    subscribeGuestProgress(listener);
    expect(readGuestProgress()).toHaveLength(1);

    browser.items.delete(GUEST_PROGRESS_KEY);
    for (const handler of browser.storageListeners) {
      handler({ key: GUEST_PROGRESS_KEY } as StorageEvent);
    }

    expect(listener).toHaveBeenCalledOnce();
    expect(readGuestProgress()).toEqual([]);
    expect(browser.attributes).toEqual({});
  });

  it('ignores other keys and stops listening with the last subscriber', async () => {
    const { subscribeGuestProgress } = await loadStore();
    const listener = vi.fn();
    const unsubscribe = subscribeGuestProgress(listener);
    for (const handler of browser.storageListeners) handler({ key: 'nh:theme' } as StorageEvent);
    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
    expect(browser.storageListeners.size).toBe(0);
  });
});
