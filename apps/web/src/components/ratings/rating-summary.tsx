import type { RatingSummaryDto } from '@novel-hub/core';
import { m } from '@novel-hub/shared/messages';
import { StarIcon } from 'lucide-react';
import { formatScore } from '../../lib/format';
import { StarRow } from './star-input';

const ROWS = [5, 4, 3, 2, 1] as const;

/**
 * Average, number of ratings and the 5→1 distribution as plain bars (a `--primary` fill on a
 * `--secondary` track). Each bar row is named for screen readers; the drawn parts are hidden.
 */
export function RatingSummary({ summary }: { summary: RatingSummaryDto }) {
  if (summary.count === 0 || summary.average === null) {
    return <p className="text-sm text-muted-foreground">{m.rating_empty()}</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
      <div className="flex flex-col items-center gap-1">
        <p className="text-4xl leading-none font-extrabold tabular-nums">
          <span className="sr-only">
            {m.rating_average({ average: formatScore(summary.average) })}
          </span>
          <span aria-hidden>{formatScore(summary.average)}</span>
        </p>
        {/* The average is already announced above. */}
        <StarRow score={summary.average} decorative />
        <p className="text-sm text-muted-foreground">{m.rating_count({ count: summary.count })}</p>
      </div>
      <ul className="flex min-w-[200px] flex-1 flex-col gap-1.5">
        {ROWS.map((stars) => {
          const count = summary.distribution[stars];
          return (
            <li
              key={stars}
              aria-label={m.rating_distribution_row({ stars, count })}
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <span aria-hidden className="w-3 text-right tabular-nums">
                {stars}
              </span>
              <StarIcon aria-hidden className="size-3.5 fill-primary text-primary" />
              <span aria-hidden className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${(count / summary.count) * 100}%` }}
                />
              </span>
              <span aria-hidden className="w-8 text-right tabular-nums">
                {count}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
