import type { ContestStatus } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { formatDateTime } from '../../lib/format';

export const CONTEST_STATUS_LABELS: Record<ContestStatus, () => string> = {
  open: m.contest_status_open,
  upcoming: m.contest_status_upcoming,
  ended: m.contest_status_ended,
};

/**
 * `HH:mm dd/MM/yyyy – HH:mm dd/MM/yyyy` in Vietnam time: entries close at the exact minute, and
 * no relative time (the HTML is cached).
 */
export function contestPeriod(contest: { startsAt: string; endsAt: string }): string {
  return m.contest_period({
    from: formatDateTime(contest.startsAt),
    to: formatDateTime(contest.endsAt),
  });
}
