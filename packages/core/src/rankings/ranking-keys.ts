import type { RankingPeriod, RankingVariant } from '@novel-hub/shared';

/**
 * Redis key of one ranking: a sorted set of story ids under the queue prefix, best first
 * (`ZRANGE … REV`). Written whole by the worker, read by the web.
 */
export function rankingKey(prefix: string, period: RankingPeriod, variant: RankingVariant): string {
  return `${prefix}:rank:${period}:${variant}`;
}
