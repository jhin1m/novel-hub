import { m } from '@novel-hub/shared/messages';

/**
 * A non-2xx answer from `/api/v1/*`, carrying the `{ error: { code } }` of the body when present
 * and, on 429, the `Retry-After` seconds.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly retryAfterSec: number | undefined;

  constructor(status: number, code: string | undefined, retryAfterSec?: number) {
    super(`API request failed: ${status} ${code ?? ''}`.trim());
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryAfterSec = retryAfterSec;
  }
}

/** "Too fast, try again in N minutes" (whole minutes, at least one); without a wait, a vague "soon". */
export function rateLimitedMessage(retryAfterSec: unknown): string {
  if (typeof retryAfterSec !== 'number' || !(retryAfterSec > 0)) return m.error_rate_limited();
  return m.error_rate_limited_minutes({ minutes: Math.max(1, Math.ceil(retryAfterSec / 60)) });
}

/** Reads the error body of a failed response (consuming it) into an `ApiError`. */
export async function readApiError(res: Response): Promise<ApiError> {
  let code: string | undefined;
  try {
    const body: unknown = await res.json();
    if (typeof body === 'object' && body !== null && 'error' in body) {
      const { error } = body;
      if (typeof error === 'object' && error !== null && 'code' in error) {
        code = typeof error.code === 'string' ? error.code : undefined;
      }
    }
  } catch {
    // Not JSON (proxy error page, network cut): only the status is known.
  }
  const retryAfter = Number(res.headers.get('retry-after'));
  return new ApiError(res.status, code, retryAfter > 0 ? retryAfter : undefined);
}

const MESSAGES: Record<string, () => string> = {
  UNAUTHENTICATED: m.error_unauthenticated,
  EMAIL_NOT_VERIFIED: m.error_email_not_verified,
  FORBIDDEN: m.error_forbidden,
  NOT_FOUND: m.story_not_found,
  VALIDATION_ERROR: m.error_validation,
  UNKNOWN_TAG: m.error_unknown_tag,
  MAIN_TAG_NOT_GENRE: m.error_main_tag_not_genre,
  TOO_MANY_TAGS: m.error_too_many_tags,
  FILE_TOO_LARGE: m.error_file_too_large,
  UNSUPPORTED_IMAGE: m.error_unsupported_image,
  IMAGE_TOO_SMALL: m.error_image_too_small,
  IMAGE_TOO_LARGE: m.error_image_too_large,
  STORAGE_UNAVAILABLE: m.error_storage_unavailable,
  UPLOAD_BUSY: m.error_upload_busy,
  DRAFT_CONFLICT: m.error_draft_conflict,
  INVALID_DOCUMENT: m.error_invalid_document,
  WORD_COUNT_OUT_OF_RANGE: m.error_word_count_out_of_range,
  INVALID_SCHEDULE_TIME: m.error_invalid_schedule_time,
  CHAPTER_HIDDEN_BY_MOD: m.error_chapter_hidden_by_mod,
  ALREADY_PUBLISHED: m.error_already_published,
  NOT_SCHEDULED: m.error_not_scheduled,
};

/** User-facing message for an API error code; anything unknown gets the generic message. */
export function apiErrorMessage(error: unknown): string {
  const code = error instanceof ApiError ? error.code : undefined;
  if (error instanceof ApiError && code === 'RATE_LIMITED') {
    return rateLimitedMessage(error.retryAfterSec);
  }
  return ((code && MESSAGES[code]) || m.error_generic)();
}
