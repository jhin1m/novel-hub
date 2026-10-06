import { z } from 'zod';
import { isValidPublicId } from '../public-id';
import { usernameParamSchema } from './catalog';

/** `follows.target_type`, in the order of the `follow_target` enum: a story, or a user as author. */
export const FOLLOW_TARGET_TYPES = ['story', 'user'] as const;
export type FollowTargetType = (typeof FOLLOW_TARGET_TYPES)[number];

/** `:username` of `PUT|DELETE /api/v1/follows/authors/:username`. */
export const followAuthorParamSchema = z.object({ username: usernameParamSchema });

/**
 * Query of `GET /api/v1/follows/status`: the story and/or author whose follow buttons are on the
 * page. The answer only has the keys that were asked.
 */
export const followStatusQuerySchema = z.object({
  story: z.string().refine(isValidPublicId).optional(),
  author: usernameParamSchema.optional(),
});
export type FollowStatusQuery = z.output<typeof followStatusQuerySchema>;
