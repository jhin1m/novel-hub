import { describe, expect, it } from 'vitest';
import { type HomeSection, claimSections } from './home-sections';

type Story = { publicId: string };
const list = (...ids: string[]): Story[] => ids.map((publicId) => ({ publicId }));
const ids = (sections: Story[][]) => sections.map((s) => s.map((story) => story.publicId));
const section = (
  stories: Story[],
  limit: number,
  extra: Partial<HomeSection<Story>> = {},
): HomeSection<Story> => ({ stories, limit, filtered: true, ...extra });

describe('claimSections', () => {
  it('drops stories an earlier section shows, then keeps the limit', () => {
    const result = claimSections([
      section(list('a'), 1),
      section(list('a', 'b', 'c'), 2),
      section(list('b', 'c', 'd', 'e'), 2),
    ]);
    expect(ids(result)).toEqual([['a'], ['b', 'c'], ['d', 'e']]);
  });

  it('only claims what a section shows, not what it cut', () => {
    const result = claimSections([section(list('a', 'b', 'c'), 1), section(list('b', 'c'), 5)]);
    expect(ids(result)).toEqual([['a'], ['b', 'c']]);
  });

  it('shows an unfiltered section as given, and it still claims its stories', () => {
    const result = claimSections([
      section(list('a'), 1),
      section(list('a', 'b'), 5, { filtered: false }),
      section(list('a', 'b', 'c'), 5),
    ]);
    expect(ids(result)).toEqual([['a'], ['a', 'b'], ['c']]);
  });

  it('claims `alsoClaim` stories for the sections after it without showing them', () => {
    const result = claimSections([
      section(list('m', 'a'), 5, { alsoClaim: list('b') }),
      section(list('a', 'b', 'c'), 5),
    ]);
    expect(ids(result)).toEqual([['m', 'a'], ['c']]);
  });

  it('claims only the part of `alsoClaim` the section would show, never its spare stories', () => {
    const result = claimSections([
      section(list('a'), 1),
      section(list('m'), 2, { alsoClaim: list('a', 'b', 'c', 'd') }),
      section(list('b', 'c', 'd'), 5),
    ]);
    expect(ids(result)).toEqual([['a'], ['m'], ['d']]);
  });

  it('shows a story listed twice in one section once', () => {
    expect(ids(claimSections([section(list('a', 'a', 'b'), 5)]))).toEqual([['a', 'b']]);
  });

  it('handles empty sections and an empty list of sections', () => {
    expect(claimSections([])).toEqual([]);
    expect(ids(claimSections([section([], 3), section(list('a'), 3)]))).toEqual([[], ['a']]);
  });
});

describe('claimSections on the home page order', () => {
  // hero, picks, rankings (period shown first), recently completed, spotlight.
  const home = (o: { ranking: Story[]; completed: Story[]; completedSsr?: Story[] }) =>
    ids(
      claimSections([
        section(list('h'), 1),
        section(list('p'), 3),
        section(o.ranking, 5, { filtered: false }),
        section(o.completed, 12, { alsoClaim: o.completedSsr ?? o.completed }),
        section(list('h', 'c', 'n1', 'r'), 8),
      ]),
    );

  it('keeps a ranked story out of "recently completed"', () => {
    expect(home({ ranking: list('r'), completed: list('r', 'c') })[3]).toEqual(['c']);
  });

  it('shows a completed new story there only, and never the hero in the spotlight', () => {
    const [, , , completed, spotlight] = home({ ranking: [], completed: list('c') });
    expect(completed).toEqual(['c']);
    expect(spotlight).toEqual(['n1', 'r']);
  });

  it('still claims a server-rendered story the 18+ list pushed out, for the sections below', () => {
    const [, , , completed, spotlight] = home({
      ranking: [],
      completed: list('m'),
      completedSsr: list('c'),
    });
    expect(completed).toEqual(['m']);
    expect(spotlight).toEqual(['n1', 'r']);
  });
});
