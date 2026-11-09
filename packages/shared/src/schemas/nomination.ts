import { z } from 'zod';
import { isValidPublicId } from '../public-id';
import { vnWeekStart } from '../rankings';
import { statsDate } from '../views';

export const NOMINATION_RULES = {
  /** Free nominations per account per week (Monday 00:00 Vietnam time). */
  perWeek: 3,
  /** Stories on the weekly "most nominated" board. */
  boardSize: 50,
} as const;

/** Monday (Vietnam time) of the week containing `now`, `YYYY-MM-DD`: the `week_start` key. */
export function nominationWeekStart(now: Date): string {
  return vnWeekStart(statsDate(now));
}

/** Body of a new nomination. */
export const nominationCreateSchema = z
  .object({ publicId: z.string().refine(isValidPublicId) })
  .strict();

/** Query of the viewer's nomination status for a story. */
export const nominationStatusQuerySchema = z.object({ story: z.string().refine(isValidPublicId) });

/**
 * Top readers of a story: public signals only (chapters read count only alongside one), chapters
 * capped so a very long story cannot drown the other signals.
 */
export const TOP_READERS = {
  limit: 10,
  chapterCap: 100,
  weights: { chapter: 1, commentedChapter: 2, rating: 5, nomination: 3 },
} as const;
