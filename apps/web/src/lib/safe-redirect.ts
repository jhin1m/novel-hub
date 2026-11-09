import { z } from 'zod';

// Relative imports only: Vitest has no `@/` alias and this module is unit tested.

/** Why a guest was sent to sign in; picks the short notice shown on the sign-in page. */
export const SIGN_IN_REASONS = [
  'follow',
  'library',
  'report',
  'comment',
  'rating',
  'nominate',
] as const;
export type SignInReason = (typeof SIGN_IN_REASONS)[number];

/** `?redirect=…&reason=…` of `/sign-in` and `/sign-up`; anything malformed is dropped. */
export const signInSearchSchema = z.object({
  redirect: z.string().optional().catch(undefined),
  reason: z.enum(SIGN_IN_REASONS).optional().catch(undefined),
});
export type SignInSearch = z.infer<typeof signInSearchSchema>;

const FALLBACK = '/';
const MAX_LENGTH = 2048;
const BASE = 'http://n.invalid';
// Encoded `/`, `\` and `.` in the path: Better Auth rejects the first two, the last hides dot-segments.
const ENCODED_SEPARATOR_OR_DOT = /%(2f|5c|2e)/i;
// Sending back to an auth page loops; `/api/` is not a page. Routes match case-insensitively.
const BLOCKED_PATH = /^\/(sign-in|sign-up|api)(\/|$)/i;

/** Control characters, whitespace (incl. C1 such as U+0085) and backslashes, which browsers read as `/`. */
function hasUnsafeChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x20 || (code >= 0x7f && code <= 0x9f) || code === 0x5c) return true;
  }
  return false;
}

/** Root-relative (`/x`, never protocol-relative `//x`) with no unsafe character. */
function isRootRelative(value: string): boolean {
  return value.startsWith('/') && !value.startsWith('//') && !hasUnsafeChar(value);
}

/**
 * The only reader of `?redirect=`: returns it as an internal path (pathname + search + hash), or
 * `/` when it could lead off-site or is malformed. The output is checked again after URL
 * normalisation, which can turn `/.//x` into `//x`. At least as strict as Better Auth's own
 * `callbackURL` check, so a target accepted here is never refused by the server.
 */
export function safeRedirectPath(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_LENGTH) {
    return FALLBACK;
  }
  if (!isRootRelative(value)) return FALLBACK;
  const path = value.split(/[?#]/, 1)[0] ?? '';
  if (ENCODED_SEPARATOR_OR_DOT.test(path)) return FALLBACK;
  if (path.split('/').some((segment) => segment === '.' || segment === '..')) return FALLBACK;

  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return FALLBACK;
  }
  if (url.origin !== BASE || BLOCKED_PATH.test(url.pathname)) return FALLBACK;
  const out = url.pathname + url.search + url.hash;
  return isRootRelative(out) ? out : FALLBACK;
}

/** Search params of a sign-in link that brings the guest back to `redirect`. */
export function signInSearch(redirect: string, reason?: SignInReason): SignInSearch {
  return reason ? { redirect, reason } : { redirect };
}

/** `/sign-in?redirect=…[&reason=…]` as a plain string, for places that need an `href`. */
export function signInHref(redirect: string, reason?: SignInReason): string {
  const params = new URLSearchParams({ redirect });
  if (reason) params.set('reason', reason);
  return `/sign-in?${params.toString()}`;
}
