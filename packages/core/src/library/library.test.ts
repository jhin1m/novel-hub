import { libraryShelf } from '@novel-hub/db';
import { SHELVES } from '@novel-hub/shared';
import { describe, expect, it } from 'vitest';
import { resumeScrollPct } from '../reading/continue';

describe('shelves', () => {
  it('match the library_shelf enum of the database, in order', () => {
    expect([...SHELVES]).toEqual(libraryShelf.enumValues);
  });
});

describe('resumeScrollPct', () => {
  it('keeps the position on the saved chapter and starts other chapters at the top', () => {
    expect(resumeScrollPct('a', 'a', 42.5)).toBe(42.5);
    expect(resumeScrollPct('a', 'b', 42.5)).toBe(0);
  });
});
