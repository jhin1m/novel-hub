import { m } from '@novel-hub/shared/messages';
import type { NominationStatus } from '@/lib/nominations';

/**
 * What the "Nominate" button shows. `pending` is the neutral, disabled button the server renders
 * for everyone (the story page is cached publicly) and the browser keeps until the account and its
 * nomination status are known. `note` is the short line beside the button.
 */
export type NominateButtonView =
  | { kind: 'hidden' }
  | { kind: 'pending'; label: string }
  | { kind: 'guest'; label: string }
  | { kind: 'disabled'; label: string; note?: string }
  | { kind: 'active'; label: string; note: string };

export function nominateButtonView(s: {
  /** `useMe()` has not answered (always so on the server) or failed. */
  meUnknown: boolean;
  signedIn: boolean;
  /** The reader wrote the story. */
  isOwner: boolean;
  /** `undefined` while it loads, or when it failed. */
  status: NominationStatus | undefined;
  /** The story cannot be nominated at all (no published chapter yet). */
  statusNotFound: boolean;
}): NominateButtonView {
  const label = m.nominate_button();
  if (s.isOwner || s.statusNotFound || s.status?.eligibility === 'own_story') {
    return { kind: 'hidden' };
  }
  if (s.meUnknown) return { kind: 'pending', label };
  if (!s.signedIn) return { kind: 'guest', label };
  if (!s.status) return { kind: 'pending', label };
  switch (s.status.eligibility) {
    case 'too_new':
      return { kind: 'disabled', label, note: m.error_account_too_new() };
    case 'muted':
      return { kind: 'disabled', label, note: m.error_user_muted() };
    case 'unverified':
      return { kind: 'disabled', label, note: m.error_email_not_verified() };
  }
  const remaining = m.nominate_remaining({ count: String(s.status.remaining) });
  if (s.status.nominated) return { kind: 'disabled', label: m.nominate_done(), note: remaining };
  if (s.status.remaining <= 0) return { kind: 'disabled', label: m.nominate_none_left() };
  return { kind: 'active', label, note: remaining };
}
