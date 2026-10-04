import { m } from '@novel-hub/shared/messages';

/** Mã lỗi của Better Auth và hook trong `@novel-hub/auth` → chuỗi hiển thị. */
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

/** Lỗi trả về từ `authClient` (Better Auth trả object, không ném), bọc thành `Error`. */
export class AuthClientError extends Error {
  readonly code: string | undefined;

  constructor(error: { code?: string | undefined; message?: string | undefined }) {
    super(error.message ?? error.code ?? 'Lỗi xác thực');
    this.name = 'AuthClientError';
    this.code = error.code;
  }
}

/** Ném `AuthClientError` khi lời gọi `authClient` trả lỗi. */
export function throwIfAuthError(
  error: { code?: string | undefined; message?: string | undefined } | null,
): void {
  if (error) throw new AuthClientError(error);
}

/** Nhận lỗi bất kỳ (lỗi Better Auth có `code`); không nhận ra thì trả câu chung. */
export function authErrorMessage(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  const message = typeof code === 'string' ? MESSAGES[code] : undefined;
  return (message ?? m.error_generic)();
}
