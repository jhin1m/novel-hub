import { z } from 'zod';
import { LIMITS } from '../limits';
import { normalizePlainText } from '../plain-text';
import { isValidPublicId } from '../public-id';
import { commentCursorSchema } from './comment';

/** `ratings.status`: `hidden_by_mod` by a moderator (its writer can then neither edit nor delete it). */
export const RATING_STATUSES = ['visible', 'hidden_by_mod'] as const;
export type RatingStatus = (typeof RATING_STATUSES)[number];

/** Reviews per page of a story's review list. */
export const REVIEWS_PAGE_SIZE = 10;

/**
 * Keyset cursor of the review list: `${updatedAtMicros}_${ratingId}` of the last review shown, the
 * same shape as the comment cursor. Opaque to the client; anything else is a 400.
 */
export const ratingCursorSchema = commentCursorSchema;

const story = z.string().refine(isValidPublicId);

/** Query of `GET /api/v1/ratings/mine` and `DELETE /api/v1/ratings`: a story by its public id. */
export const ratingStoryQuerySchema = z.object({ story });

/** Query of `GET /api/v1/ratings`: the summary and a page of reviews of a story. */
export const ratingListQuerySchema = z.object({ story, cursor: ratingCursorSchema });
export type RatingListQuery = z.output<typeof ratingListQuerySchema>;

/**
 * Body of `PUT /api/v1/ratings`: creates or replaces the reader's rating of a story. The review is
 * optional and normalised here (`normalizePlainText`); one with nothing visible left is stored as
 * no review, one too long is refused. The raw input is capped first so normalising stays cheap.
 */
export const ratingUpsertSchema = z.object({
  publicId: story,
  score: z.number().int().min(1).max(5),
  review: z
    .string()
    .max(LIMITS.reviewMax * 4)
    .optional()
    .transform((raw, ctx) => {
      if (raw === undefined) return null;
      const review = normalizePlainText(raw, LIMITS.reviewMax);
      if (review !== null) return review;
      // Nothing visible is "no review"; something visible that did not fit is too long.
      if (normalizePlainText(raw, Number.MAX_SAFE_INTEGER) === null) return null;
      ctx.addIssue({ code: 'custom', message: 'Too long' });
      return z.NEVER;
    }),
});
export type RatingUpsertInput = z.output<typeof ratingUpsertSchema>;
