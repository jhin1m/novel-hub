import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type DraftMirror,
  clearMirror,
  createMirrorWriter,
  mirrorKey,
  readMirror,
  sameDoc,
  writeMirror,
} from './draft-mirror';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

const mirror = (text: string): DraftMirror => ({
  doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
  baseUpdatedAt: '2026-10-05T04:05:06.123Z',
  savedAt: '2026-10-05T04:06:00.000Z',
});

afterEach(() => {
  vi.useRealTimers();
});

describe('draft mirror', () => {
  it('compares documents regardless of key order (jsonb reorders keys)', () => {
    const fromEditor = mirror('a').doc;
    const fromServer = JSON.parse(
      '{"content":[{"content":[{"text":"a","type":"text"}],"type":"paragraph"}],"type":"doc"}',
    ) as DraftMirror['doc'];
    expect(sameDoc(fromEditor, fromServer)).toBe(true);
    expect(sameDoc(fromEditor, mirror('b').doc)).toBe(false);
  });

  it('uses the public id and chapter number as key', () => {
    expect(mirrorKey('k7m2xq9p', 3)).toBe('draft:k7m2xq9p:3');
  });

  it('round-trips and clears', () => {
    const storage = memoryStorage();
    expect(writeMirror(storage, 'k', mirror('a'))).toBe(true);
    expect(readMirror(storage, 'k')).toEqual(mirror('a'));
    clearMirror(storage, 'k');
    expect(readMirror(storage, 'k')).toBeNull();
  });

  it('reads corrupt or foreign data as null', () => {
    const storage = memoryStorage();
    storage.setItem('broken', '{not json');
    storage.setItem('foreign', JSON.stringify({ doc: 'x' }));
    expect(readMirror(storage, 'broken')).toBeNull();
    expect(readMirror(storage, 'foreign')).toBeNull();
    expect(readMirror(undefined, 'k')).toBeNull();
  });

  it('reports a failed write instead of throwing (quota exceeded)', () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new DOMException('quota', 'QuotaExceededError');
    };
    expect(writeMirror(storage, 'k', mirror('a'))).toBe(false);
    expect(() =>
      clearMirror(
        {
          ...storage,
          removeItem: () => {
            throw new Error('denied');
          },
        },
        'k',
      ),
    ).not.toThrow();
  });

  it('throttles writes and keeps the latest value', async () => {
    vi.useFakeTimers();
    const storage = memoryStorage();
    const setItem = vi.spyOn(storage, 'setItem');
    const writer = createMirrorWriter({ storage, key: 'k' });
    writer.write(() => mirror('a'));
    writer.write(() => mirror('ab'));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(readMirror(storage, 'k')).toEqual(mirror('ab'));
    writer.write(() => mirror('abc'));
    writer.flush();
    expect(readMirror(storage, 'k')).toEqual(mirror('abc'));
  });
});
