import { describe, expect, it } from 'vitest';
import { continueRows } from './home';

const item = (publicId: string, isMature = false) => ({ story: { publicId, isMature } });

describe('continueRows', () => {
  const items = [item('m1', true), item('a'), item('b')];
  const ids = (rows: typeof items) => rows.map((i) => i.story.publicId);

  it('keeps the latest story the account may see, skipping 18+ when it hides them', () => {
    expect(ids(continueRows(items, false))).toEqual(['a']);
  });

  it('keeps an 18+ story as the latest when the account shows them', () => {
    expect(ids(continueRows(items, true))).toEqual(['m1']);
  });

  it('is empty when every story is hidden', () => {
    expect(continueRows([item('m1', true)], false)).toEqual([]);
  });

  it('honours a custom maximum', () => {
    expect(ids(continueRows(items, false, 2))).toEqual(['a', 'b']);
  });
});
