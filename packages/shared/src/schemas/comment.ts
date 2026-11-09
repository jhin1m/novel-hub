import { z } from 'zod';
import { LIMITS } from '../limits';
import { isValidPid } from '../editor/pid';
import { normalizePlainText } from '../plain-text';
import { isValidPublicId } from '../public-id';

/** `comments.status`: `deleted` by its writer, `hidden_by_mod` by a moderator. */
export const COMMENT_STATUSES = ['visible', 'deleted', 'hidden_by_mod'] as const;
export type CommentStatus = (typeof COMMENT_STATUSES)[number];

/** Top-level comments per page, and replies per "more replies" page. */
export const COMMENTS_PAGE_SIZE = 20;
/** Oldest replies sent along with each top-level comment. */
export const COMMENT_REPLY_PREVIEW = 3;

/**
 * Keyset cursor of comment lists: `${createdAtMicros}_${commentId}` of the last comment shown.
 * Microseconds, the precision Postgres stores. Opaque to the client, which only sends back what the
 * previous page returned; anything else is a 400.
 */
export const commentCursorSchema = z
  .string()
  .regex(/^\d{1,17}_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  .optional();

const chapterNumber = z.coerce.number().int().positive().max(2_147_483_647);

/** A paragraph of the published chapter by its `data-pid`; whether it exists is the server's call. */
const paragraphId = z.string().refine(isValidPid);

const publicId = z.string().refine(isValidPublicId);

/** A chapter by its public keys. */
const chapterQuery = {
  story: publicId,
  chapter: chapterNumber,
};

/**
 * Query of `GET /api/v1/comments`. With `paragraph`: the threads about that paragraph. Without:
 * the threads about the chapter as a whole, plus those whose paragraph is gone from it.
 */
export const commentListQuerySchema = z.object({
  ...chapterQuery,
  paragraph: paragraphId.optional(),
  cursor: commentCursorSchema,
});
export type CommentListQuery = z.output<typeof commentListQuerySchema>;

/** Query of `GET /api/v1/comments/paragraph-counts`. */
export const paragraphCountsQuerySchema = z.object(chapterQuery);

/** Query of `GET /api/v1/comments/:id/replies`. */
export const commentRepliesQuerySchema = z.object({ cursor: commentCursorSchema });

/** `:id` of the comment routes; the UI keeps it but never shows it. */
export const commentIdParamSchema = z.object({ id: z.uuid() });

/**
 * Comment text, normalised here (`normalizePlainText`) so what the service stores is already clean;
 * the raw input is capped first so normalising stays cheap.
 */
const commentBody = z
  .string()
  .max(LIMITS.commentMax * 4)
  .transform((raw, ctx) => {
    const body = normalizePlainText(raw, LIMITS.commentMax);
    if (body === null) {
      ctx.addIssue({ code: 'custom', message: 'Empty or too long' });
      return z.NEVER;
    }
    return body;
  });

/** Body of `POST /api/v1/comments`. */
export const commentCreateSchema = z.object({
  publicId,
  chapterNumber: z.number().int().positive().max(2_147_483_647),
  /** Replying to a reply attaches to its top-level comment (threads are two levels). */
  parentId: z.uuid().optional(),
  /** The paragraph a top-level comment is about; a reply takes its thread's instead. */
  paragraphId: paragraphId.optional(),
  body: commentBody,
});
export type CommentCreateInput = z.output<typeof commentCreateSchema>;

/** Comments the story's author may pin in one chapter, or in the story's discussion. */
export const COMMENT_PIN_MAX = 3;

/** Body of `PATCH /api/v1/comments/:id`: the writer replaces the text of their comment. */
export const commentEditSchema = z.object({ body: commentBody }).strict();
export type CommentEditInput = z.output<typeof commentEditSchema>;

/** Body of `PUT /api/v1/comments/:id/pin`: the story's author pins or unpins a top-level comment. */
export const commentPinSchema = z.object({ pinned: z.boolean() }).strict();

/** Query of the story discussion list: top-level comments not tied to any chapter. */
export const discussionListQuerySchema = z.object({ story: publicId, cursor: commentCursorSchema });
export type DiscussionListQuery = z.output<typeof discussionListQuerySchema>;

/** Body of a new story discussion comment; same body rules as a chapter comment, no chapter. */
export const discussionCreateSchema = z
  .object({ publicId, parentId: z.uuid().optional(), body: commentBody })
  .strict();
export type DiscussionCreateInput = z.output<typeof discussionCreateSchema>;
