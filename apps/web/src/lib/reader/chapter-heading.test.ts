import { describe, expect, it } from 'vitest';
import { chapterHeading } from './chapter-heading';

describe('chapterHeading', () => {
  it('uses "Chương N" as the heading of an untitled chapter, with no label', () => {
    expect(chapterHeading({ number: 2, title: null })).toEqual({
      heading: 'Chương 2',
      label: null,
    });
  });

  it('uses the title as the heading and "Chương N" as the label of a titled chapter', () => {
    expect(chapterHeading({ number: 12, title: 'Mưa đêm' })).toEqual({
      heading: 'Mưa đêm',
      label: 'Chương 12',
    });
  });

  it('treats an empty title as no title', () => {
    expect(chapterHeading({ number: 3, title: '' })).toEqual({ heading: 'Chương 3', label: null });
  });
});
