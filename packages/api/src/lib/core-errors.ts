import type { Context } from 'hono';
import { errorBody } from './errors';

/** Expected business errors from `core` and their HTTP status. Literal types let `hc` infer them. */
const CORE_ERROR_STATUS = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  UNKNOWN_TAG: 422,
  MAIN_TAG_NOT_GENRE: 422,
  TOO_MANY_TAGS: 422,
  IMAGE_TOO_SMALL: 422,
  IMAGE_TOO_LARGE: 422,
  FILE_TOO_LARGE: 413,
  UNSUPPORTED_IMAGE: 415,
  UPLOAD_BUSY: 503,
  DRAFT_CONFLICT: 409,
  INVALID_DOCUMENT: 422,
  DRAFT_TOO_LARGE: 413,
  WORD_COUNT_OUT_OF_RANGE: 422,
  INVALID_SCHEDULE_TIME: 422,
  CHAPTER_HIDDEN_BY_MOD: 409,
  ALREADY_PUBLISHED: 409,
  NOT_SCHEDULED: 409,
  ADULT_CONFIRMATION_REQUIRED: 400,
  INVALID_STATE: 409,
  USER_MUTED: 403,
  COMMENT_PARAGRAPH_INVALID: 422,
  RATING_HIDDEN: 409,
  FEATURED_MATURE: 422,
  CONTEST_NOT_OPEN: 409,
  CONTEST_STORY_INELIGIBLE: 422,
  CONTEST_PLACEMENT_TAKEN: 409,
} as const;

export type CoreErrorCode = keyof typeof CORE_ERROR_STATUS;

/** Developer-facing; the UI shows its own message for each code. */
const CORE_ERROR_MESSAGES: Record<CoreErrorCode, string> = {
  NOT_FOUND: 'Resource not found',
  FORBIDDEN: 'Not allowed',
  UNKNOWN_TAG: 'Unknown tag',
  MAIN_TAG_NOT_GENRE: 'The main tag must be a genre',
  TOO_MANY_TAGS: 'Too many tags',
  IMAGE_TOO_SMALL: 'Image is smaller than 600×900',
  IMAGE_TOO_LARGE: 'Image has too many pixels',
  FILE_TOO_LARGE: 'File is larger than 5 MB',
  UNSUPPORTED_IMAGE: 'Only JPEG, PNG and WebP images are accepted',
  UPLOAD_BUSY: 'Too many uploads in progress, try again shortly',
  DRAFT_CONFLICT: 'The draft was saved elsewhere since it was loaded',
  INVALID_DOCUMENT: 'The document does not match the editor schema',
  DRAFT_TOO_LARGE: 'Draft is larger than 2 MB',
  WORD_COUNT_OUT_OF_RANGE: 'A published chapter must have 300 to 20,000 words',
  INVALID_SCHEDULE_TIME: 'The publish time must be 5 minutes to 365 days ahead',
  CHAPTER_HIDDEN_BY_MOD: 'The chapter was hidden by a moderator',
  ALREADY_PUBLISHED: 'The chapter has already been published',
  NOT_SCHEDULED: 'The chapter is not scheduled',
  ADULT_CONFIRMATION_REQUIRED: 'Turning 18+ content on requires confirming you are 18 or older',
  INVALID_STATE: 'The target is not in a state this action applies to',
  USER_MUTED: 'This account is muted and cannot post',
  COMMENT_PARAGRAPH_INVALID: 'The paragraph is not in the published chapter',
  RATING_HIDDEN: 'The rating was hidden by a moderator',
  FEATURED_MATURE: 'An 18+ story cannot be featured',
  CONTEST_NOT_OPEN: 'The contest is not open',
  CONTEST_STORY_INELIGIBLE: 'The story may not enter this contest',
  CONTEST_PLACEMENT_TAKEN: 'Another entry already holds this place',
};

export function coreError<C extends CoreErrorCode>(c: Context, code: C) {
  return c.json(errorBody(code, CORE_ERROR_MESSAGES[code]), CORE_ERROR_STATUS[code]);
}
