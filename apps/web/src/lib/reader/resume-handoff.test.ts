import { describe, expect, it } from 'vitest';
import { createChapterHandoff, setResumeHandoff, takeResumeHandoff } from './resume-handoff';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

const NOW = 1_791_158_400_000;

describe('resume handoff', () => {
  it('hands the position to the matching chapter once', () => {
    const storage = memoryStorage();
    setResumeHandoff({ publicId: 'k7m2xq9p', number: 2, scrollPct: 48.5 }, NOW, storage);
    expect(takeResumeHandoff('k7m2xq9p', 2, NOW + 1_000, storage)).toBe(48.5);
    expect(takeResumeHandoff('k7m2xq9p', 2, NOW + 1_000, storage)).toBeNull();
  });

  it('another story, another chapter or a stale handoff → null, and the handoff is gone', () => {
    for (const [publicId, number, now] of [
      ['abcdefgh', 2, NOW],
      ['k7m2xq9p', 3, NOW],
      ['k7m2xq9p', 2, NOW + 60_000],
      ['k7m2xq9p', 2, NOW - 1],
    ] as const) {
      const storage = memoryStorage();
      setResumeHandoff({ publicId: 'k7m2xq9p', number: 2, scrollPct: 10 }, NOW, storage);
      expect(takeResumeHandoff(publicId, number, now, storage)).toBeNull();
      expect(storage.map.size).toBe(0);
    }
  });

  it('ignores malformed values and blocked storage', () => {
    const storage = memoryStorage();
    for (const raw of [
      'not json',
      '{}',
      JSON.stringify({ publicId: 'k7m2xq9p', number: 2, scrollPct: 101, at: NOW }),
    ]) {
      storage.setItem('nh:resume', raw);
      expect(takeResumeHandoff('k7m2xq9p', 2, NOW, storage)).toBeNull();
    }
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
      removeItem: () => {},
    };
    expect(() =>
      setResumeHandoff({ publicId: 'k7m2xq9p', number: 2, scrollPct: 1 }, NOW, blocked),
    ).not.toThrow();
    expect(takeResumeHandoff('k7m2xq9p', 2, NOW, blocked)).toBeNull();
  });
});

describe('chapter handoff', () => {
  const listen = createChapterHandoff(
    'nh:listen',
    (value): value is { rate: number } => typeof (value as { rate?: unknown }).rate === 'number',
  );

  it('hands its payload to the matching chapter once', () => {
    const storage = memoryStorage();
    listen.set('k7m2xq9p', 3, { rate: 1.5 }, NOW, storage);
    expect(listen.take('k7m2xq9p', 3, NOW + 59_999, storage)).toMatchObject({ rate: 1.5 });
    expect(listen.take('k7m2xq9p', 3, NOW + 59_999, storage)).toBeNull();
  });

  it('another story, another chapter, a stale or bad payload, blocked storage → null', () => {
    for (const [publicId, number, now] of [
      ['abcdefgh', 3, NOW],
      ['k7m2xq9p', 2, NOW],
      ['k7m2xq9p', 3, NOW + 60_000],
    ] as const) {
      const storage = memoryStorage();
      listen.set('k7m2xq9p', 3, { rate: 1 }, NOW, storage);
      expect(listen.take(publicId, number, now, storage)).toBeNull();
      expect(storage.map.size).toBe(0);
    }
    const storage = memoryStorage();
    storage.setItem('nh:listen', JSON.stringify({ publicId: 'k7m2xq9p', number: 3, at: NOW }));
    expect(listen.take('k7m2xq9p', 3, NOW, storage)).toBeNull();
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
      removeItem: () => {},
    };
    expect(() => listen.set('k7m2xq9p', 3, { rate: 1 }, NOW, blocked)).not.toThrow();
    expect(listen.take('k7m2xq9p', 3, NOW, blocked)).toBeNull();
  });

  it('the resume and listen handoffs live under their own keys', () => {
    const storage = memoryStorage();
    setResumeHandoff({ publicId: 'k7m2xq9p', number: 3, scrollPct: 20 }, NOW, storage);
    listen.set('k7m2xq9p', 3, { rate: 2 }, NOW, storage);
    expect(listen.take('k7m2xq9p', 3, NOW, storage)).toMatchObject({ rate: 2 });
    expect(takeResumeHandoff('k7m2xq9p', 3, NOW, storage)).toBe(20);
  });
});
