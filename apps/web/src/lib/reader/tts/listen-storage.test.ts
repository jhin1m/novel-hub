import { describe, expect, it } from 'vitest';
import { listenHandoff, readListenRate, saveListenRate } from './listen-storage';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

describe('listen speed', () => {
  it('remembers one of the offered speeds', () => {
    const storage = memoryStorage();
    expect(readListenRate(storage)).toBe(1);
    saveListenRate(1.5, storage);
    expect(readListenRate(storage)).toBe(1.5);
  });

  it('anything else, or blocked storage, gives the normal speed', () => {
    for (const raw of ['not json', 'null', '{}', '{"rate":3}', '{"rate":"2"}']) {
      const storage = memoryStorage();
      storage.setItem('nh:listen', raw);
      expect(readListenRate(storage)).toBe(1);
    }
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(readListenRate(blocked)).toBe(1);
    expect(() => saveListenRate(2, blocked)).not.toThrow();
  });

  it('the handoff only carries an offered speed', () => {
    const storage = memoryStorage();
    listenHandoff.set('k7m2xq9p', 2, { rate: 1.25 }, 1_000, storage);
    expect(listenHandoff.take('k7m2xq9p', 2, 2_000, storage)?.rate).toBe(1.25);
    storage.setItem(
      'nh:listen',
      JSON.stringify({ publicId: 'k7m2xq9p', number: 2, rate: 9, at: 1_000 }),
    );
    expect(listenHandoff.take('k7m2xq9p', 2, 2_000, storage)).toBeNull();
  });
});
