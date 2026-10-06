/**
 * Author milestone badges: the catalog the worker upserts into `badges` and awards from. Display
 * names and descriptions are Paraglide messages keyed by `code`; `name`/`description` here are
 * short English notes stored in the table for reference only, the UI never reads them.
 */

/**
 * What an author must reach, counted over their public stories (published, author not banned):
 * published chapters, words, followers of the author (verified email, not banned) or one
 * completed story with a chapter.
 */
export type BadgeRule =
  { kind: 'chapters' | 'words' | 'followers'; min: number } | { kind: 'completed_story' };

export interface BadgeDefinition {
  code: string;
  name: string;
  description: string;
  rule: BadgeRule;
}

/** In display order. Badges are never taken back once awarded. */
export const BADGES = [
  {
    code: 'first_chapter',
    name: 'First chapter',
    description: 'Published a first chapter',
    rule: { kind: 'chapters', min: 1 },
  },
  {
    code: 'chapters_10',
    name: '10 chapters',
    description: 'Published 10 chapters',
    rule: { kind: 'chapters', min: 10 },
  },
  {
    code: 'chapters_100',
    name: '100 chapters',
    description: 'Published 100 chapters',
    rule: { kind: 'chapters', min: 100 },
  },
  {
    code: 'words_100k',
    name: '100,000 words',
    description: 'Published 100,000 words',
    rule: { kind: 'words', min: 100_000 },
  },
  {
    code: 'words_1m',
    name: '1,000,000 words',
    description: 'Published 1,000,000 words',
    rule: { kind: 'words', min: 1_000_000 },
  },
  {
    code: 'followers_10',
    name: '10 followers',
    description: 'Followed by 10 readers',
    rule: { kind: 'followers', min: 10 },
  },
  {
    code: 'followers_100',
    name: '100 followers',
    description: 'Followed by 100 readers',
    rule: { kind: 'followers', min: 100 },
  },
  {
    code: 'story_completed',
    name: 'Story completed',
    description: 'Completed a story',
    rule: { kind: 'completed_story' },
  },
] as const satisfies readonly BadgeDefinition[];

export type BadgeCode = (typeof BADGES)[number]['code'];

export const BADGE_CODES: readonly BadgeCode[] = BADGES.map((b) => b.code);

export function isBadgeCode(code: string): code is BadgeCode {
  return (BADGE_CODES as readonly string[]).includes(code);
}
