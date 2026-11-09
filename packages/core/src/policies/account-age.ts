import { TRUSTED_ACCOUNT_DAYS } from '@novel-hub/shared';
import type { PolicyUser } from './user';

const DAY_MS = 86_400_000;

/** Whether the account was created at least `days` full days before `now`. */
export function isAccountOlderThan(user: { createdAt: Date }, days: number, now: Date): boolean {
  return now.getTime() - user.createdAt.getTime() >= days * DAY_MS;
}

/**
 * Features that are easy to abuse with throwaway accounts (nominating stories, importing many
 * chapters at once): a verified, active account at least `TRUSTED_ACCOUNT_DAYS` old. The result is
 * the API error code to answer with, or `ok`.
 */
export function canUseTrustedFeature(
  user: PolicyUser & { createdAt: Date },
  now: Date,
): 'ok' | 'USER_MUTED' | 'FORBIDDEN' | 'ACCOUNT_TOO_NEW' {
  if (user.status === 'muted') return 'USER_MUTED';
  if (!user.emailVerified || user.status !== 'active') return 'FORBIDDEN';
  if (!isAccountOlderThan(user, TRUSTED_ACCOUNT_DAYS, now)) return 'ACCOUNT_TOO_NEW';
  return 'ok';
}
