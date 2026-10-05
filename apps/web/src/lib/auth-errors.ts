import { m } from '@novel-hub/shared/messages';
import { rateLimitedMessage } from './api-errors';

/** Error codes of Better Auth and the hooks in `@novel-hub/auth` → display strings. */
const MESSAGES: Record<string, () => string> = {
  INVALID_EMAIL_OR_PASSWORD: m.error_invalid_credentials,
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: m.error_email_taken,
  USER_ALREADY_EXISTS: m.error_email_taken,
  USERNAME_TAKEN: m.error_username_taken,
  USERNAME_INVALID: m.error_username_invalid,
  DISPLAY_NAME_INVALID: m.error_display_name_invalid,
  PASSWORD_TOO_SHORT: m.error_password_too_short,
  INVALID_EMAIL: m.error_invalid_email,
  ACCOUNT_BANNED: m.error_account_banned,
  INVALID_TOKEN: m.reset_invalid_link,
  PROVIDER_NOT_FOUND: m.error_google_disabled,
};

interface AuthClientErrorBody {
  code?: string | undefined;
  message?: string | undefined;
  /** Set by the API's rate limit on 429. */
  retryAfterSec?: unknown;
}

/** An error returned by `authClient` (Better Auth returns it instead of throwing), as an `Error`. */
export class AuthClientError extends Error {
  readonly code: string | undefined;
  readonly retryAfterSec: unknown;

  constructor(error: AuthClientErrorBody) {
    super(error.message ?? error.code ?? 'Authentication error');
    this.name = 'AuthClientError';
    this.code = error.code;
    this.retryAfterSec = error.retryAfterSec;
  }
}

/** Throws `AuthClientError` when an `authClient` call returned an error. */
export function throwIfAuthError(error: AuthClientErrorBody | null): void {
  if (error) throw new AuthClientError(error);
}

/** Takes any error (Better Auth errors carry `code`); anything unknown gets the generic message. */
export function authErrorMessage(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  if (code === 'RATE_LIMITED') {
    const wait =
      typeof error === 'object' && error !== null && 'retryAfterSec' in error
        ? error.retryAfterSec
        : undefined;
    return rateLimitedMessage(wait);
  }
  const message = typeof code === 'string' ? MESSAGES[code] : undefined;
  return (message ?? m.error_generic)();
}
