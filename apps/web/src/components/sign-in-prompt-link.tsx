import { m } from '@novel-hub/shared/messages';
import { Link, useRouterState } from '@tanstack/react-router';
import type { ComponentProps, ReactNode } from 'react';
import {
  type SignInReason,
  type SignInSearch,
  signInSearch,
  signInSearchSchema,
} from '@/lib/safe-redirect';

const REASON_MESSAGES: Record<SignInReason, () => string> = {
  follow: m.sign_in_reason_follow,
  library: m.sign_in_reason_library,
  report: m.sign_in_reason_report,
  comment: m.sign_in_reason_comment,
  rating: m.sign_in_reason_rating,
  nominate: m.sign_in_reason_nominate,
};

const AUTH_PAGE = /^\/sign-(in|up)$/;

/**
 * On `/sign-in` and `/sign-up`: the current `?redirect=` and `?reason=`, which a link to the other
 * page must keep. Elsewhere `undefined`.
 */
export function useAuthPageSearch(): SignInSearch | undefined {
  const location = useRouterState({ select: (state) => state.location });
  return AUTH_PAGE.test(location.pathname) ? signInSearchSchema.parse(location.search) : undefined;
}

/**
 * A guest's "sign in" link that comes back to the current page afterwards, optionally saying why
 * sign-in is needed. On the auth pages it keeps their return path instead, since going back to one
 * of those is refused. A real link, so it works before hydration; extra props (from `Button
 * asChild`) pass through to the anchor.
 */
export function SignInPromptLink({
  reason,
  children,
  ...anchor
}: { reason?: SignInReason; children: ReactNode } & Omit<
  ComponentProps<'a'>,
  'href' | 'children'
>) {
  const currentHref = useRouterState({ select: (state) => state.location.href });
  const authPageSearch = useAuthPageSearch();
  return (
    <Link {...anchor} to="/sign-in" search={authPageSearch ?? signInSearch(currentHref, reason)}>
      {children}
    </Link>
  );
}

/** The short "sign in to …" line under the sign-in and sign-up titles. */
export function SignInReasonNotice({ reason }: { reason: SignInReason | undefined }) {
  if (!reason) return null;
  return (
    <p role="status" className="text-sm text-muted-foreground">
      {REASON_MESSAGES[reason]()}
    </p>
  );
}
