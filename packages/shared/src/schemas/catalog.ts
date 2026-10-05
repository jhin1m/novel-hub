import { z } from 'zod';
import { tagSlugSchema } from './story';
import { USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH, USERNAME_PATTERN } from './user';

/** Stories per page of a tag page, and per page of the "recently updated" list. */
export const CATALOG_PAGE_SIZE = 24;

/** Stories in the "notable new stories" block of the home page. */
export const NOTABLE_LIMIT = 12;

/** Highest page number accepted anywhere; far beyond any real list. */
const MAX_PAGE = 100_000;

/** A page number written the canonical way: decimal digits, no leading zero. */
const CANONICAL_PAGE = /^[1-9][0-9]*$/;

/**
 * The page a list URL asks for, from every `page` value in its query (`searchParams.getAll`).
 * Anything that is not one canonical positive number falls back to what it most likely meant
 * (`02` → 2, `abc`/`0`/missing → 1, repeated → the first); the route then redirects to
 * `canonicalPath`, so only one URL per page ever holds content.
 */
export function canonicalPageParam(raw: readonly string[]): number {
  const first = raw[0]?.trim() ?? '';
  if (!/^[0-9]+$/.test(first)) return 1;
  const page = Number(first);
  return page >= 1 && page <= MAX_PAGE ? page : 1;
}

const pageQuery = z
  .string()
  .regex(CANONICAL_PAGE)
  .transform(Number)
  .refine((page) => page <= MAX_PAGE)
  .optional();

/** A username in a URL: the stored format, without the sign-up-only reserved-name check. */
export const usernameParamSchema = z
  .string()
  .min(USERNAME_MIN_LENGTH)
  .max(USERNAME_MAX_LENGTH)
  .regex(USERNAME_PATTERN);

/**
 * Query of `GET /api/v1/stories`: the same lists the public pages render. Whether 18+ stories are
 * included is never a parameter; the server derives it from the signed-in account.
 */
export const storyListQuery = z.discriminatedUnion('list', [
  z.object({ list: z.literal('recent'), page: pageQuery }),
  z.object({ list: z.literal('notable') }),
  z.object({ list: z.literal('tag'), tag: tagSlugSchema, page: pageQuery }),
  z.object({ list: z.literal('author'), author: usernameParamSchema }),
]);

export type StoryListQuery = z.input<typeof storyListQuery>;
