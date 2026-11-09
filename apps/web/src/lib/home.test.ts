import { describe, expect, it } from 'vitest';
import { continueRows, pickHero } from './home';

const story = (publicId: string, chapterCount = 1) => ({ publicId, chapterCount });
const item = (publicId: string, isMature = false) => ({ story: { publicId, isMature } });

describe('pickHero', () => {
  it('is null for an empty list or when no story has a chapter', () => {
    expect(pickHero([])).toBeNull();
    expect(pickHero([story('a', 0), story('b', 0)])).toBeNull();
  });

  it('skips stories without chapters and takes the first one with some', () => {
    const list = [story('a', 0), story('b', 3), story('c', 5)];
    expect(pickHero(list)).toBe(list[1]);
  });
});

describe('continueRows', () => {
  const items = [item('a'), item('m1', true), item('b'), item('c'), item('d')];

  it('drops 18+ stories unless the account shows them, and keeps at most 3', () => {
    expect(continueRows(items, false).map((i) => i.story.publicId)).toEqual(['a', 'b', 'c']);
  });

  it('keeps 18+ stories when the account shows them', () => {
    expect(continueRows(items, true).map((i) => i.story.publicId)).toEqual(['a', 'm1', 'b']);
  });

  it('honours a custom maximum', () => {
    expect(continueRows(items, false, 1)).toHaveLength(1);
  });
});
