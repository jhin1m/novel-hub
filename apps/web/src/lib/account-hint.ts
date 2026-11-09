/**
 * localStorage key of the "this browser was last signed in" hint. Public pages are full document
 * loads of cookie-free HTML, so `useMe()` only knows the account a moment after hydration; until
 * then the header and the home "Continue reading" box render placeholders. `BOOT_SCRIPT` reads this
 * hint before paint and marks `<html>`:
 * - `data-signed-in`: the placeholders show the signed-in header (`.signed-in-hint`) instead of the
 *   guest one (`.guest-hint`);
 * - `--account-initial`: the avatar letter, as a CSS string made only of a hex escape;
 * - `data-continue-rows`: how many "Continue reading" rows the home page showed last time.
 * Display hint only, never access control: the real account replaces it once loaded.
 */
export const ACCOUNT_HINT_KEY = 'nh:account';

/** The most rows the home "Continue reading" box shows. */
export const CONTINUE_ROWS_MAX = 3;

export interface AccountHint {
  /** Code point of the avatar letter. */
  initial: number;
  continueRows: number;
}

/** What `BOOT_SCRIPT` and `applyAccountHint` touch on `<html>`. */
export interface AccountHintRoot {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  style: { setProperty(name: string, value: string): void; removeProperty(name: string): void };
}

/** The avatar letter of an account; `Array.from` keeps a character made of two UTF-16 units whole. */
export function accountInitial(displayName: string): string {
  return Array.from(displayName)[0]?.toUpperCase() ?? '';
}

/** A printable code point (a CSS hex escape of anything else would draw a replacement glyph). */
function isInitial(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 32 && (value as number) <= 0x10ffff;
}

function isContinueRows(value: unknown): value is number {
  return (
    Number.isInteger(value) && (value as number) >= 1 && (value as number) <= CONTINUE_ROWS_MAX
  );
}

/**
 * The `content` value for a code point: `"\110 "` is "Đ". Hex digits only, so no stored value can
 * break out of the CSS string. `BOOT_SCRIPT` builds the same string inline.
 */
export function initialCssValue(codePoint: number): string {
  return `"\\${codePoint.toString(16)} "`;
}

/** The stored hint, or `null` when absent or not an object. */
export function parseAccountHint(raw: string | null): AccountHint | null {
  try {
    const value: unknown = JSON.parse(raw ?? 'null');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const { initial, continueRows } = value as Record<string, unknown>;
    return {
      initial: isInitial(initial) ? initial : 0,
      continueRows: isContinueRows(continueRows) ? continueRows : 0,
    };
  } catch {
    return null;
  }
}

/** Applies a hint (or its absence) to `<html>` the way `BOOT_SCRIPT` does on load. */
export function applyAccountHint(root: AccountHintRoot, hint: AccountHint | null): void {
  if (hint) root.setAttribute('data-signed-in', '');
  else root.removeAttribute('data-signed-in');
  if (hint && isInitial(hint.initial)) {
    root.style.setProperty('--account-initial', initialCssValue(hint.initial));
  } else root.style.removeProperty('--account-initial');
  if (hint && isContinueRows(hint.continueRows)) {
    root.setAttribute('data-continue-rows', String(hint.continueRows));
  } else root.removeAttribute('data-continue-rows');
}

/** Stores and applies `hint` (`null` = forget). Browser only; blocked storage costs a flash. */
function storeAccountHint(hint: AccountHint | null): void {
  try {
    if (hint) window.localStorage.setItem(ACCOUNT_HINT_KEY, JSON.stringify(hint));
    else window.localStorage.removeItem(ACCOUNT_HINT_KEY);
  } catch {
    // Storage may be blocked: the next page shows the guest placeholders until the account loads.
  }
  applyAccountHint(document.documentElement, hint);
}

function readAccountHint(): AccountHint | null {
  try {
    return parseAccountHint(window.localStorage.getItem(ACCOUNT_HINT_KEY));
  } catch {
    return null;
  }
}

/** Remembers the signed-in account; the "Continue reading" row count is kept. */
export function rememberAccount(displayName: string): void {
  const initial = accountInitial(displayName).codePointAt(0) ?? 0;
  storeAccountHint({ initial, continueRows: readAccountHint()?.continueRows ?? 0 });
}

/** Forgets the account (signed out, or the session is gone). */
export function forgetAccount(): void {
  storeAccountHint(null);
}

/** Remembers how many "Continue reading" rows the home page shows, for the next load's placeholder. */
export function rememberContinueRows(count: number): void {
  const hint = readAccountHint();
  if (!hint || hint.continueRows === count) return;
  storeAccountHint({ ...hint, continueRows: count });
}
