import type { ChapterStatsRow } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { formatDecimal } from '../../lib/format';

/** Rows per page of the chapter table; long stories page in the browser. */
export const CHAPTER_STATS_PAGE_SIZE = 100;

/** Page `page` (clamped to the last one) of the chapter rows, and how many pages there are. */
export function pageChapterStats(chapters: readonly ChapterStatsRow[], page: number) {
  const totalPages = Math.max(1, Math.ceil(chapters.length / CHAPTER_STATS_PAGE_SIZE));
  const current = Math.min(Math.max(page, 1), totalPages);
  const start = (current - 1) * CHAPTER_STATS_PAGE_SIZE;
  return {
    rows: chapters.slice(start, start + CHAPTER_STATS_PAGE_SIZE),
    page: current,
    totalPages,
  };
}

/**
 * Per-chapter reads (with a bar relative to `maxViews`, the most-read chapter of the story), readers
 * who reached the chapter and drop-off, as a real table. The bars are drawn only (`aria-hidden`);
 * the numbers carry them.
 */
export function ChapterStatsTable({
  rows,
  maxViews,
}: {
  rows: readonly ChapterStatsRow[];
  maxViews: number;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="text-left text-[13px] text-muted-foreground">
          <tr className="border-b border-border">
            <th scope="col" className="px-4 py-3 font-semibold">
              {m.dashboard_col_chapter()}
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              {m.dashboard_col_views()}
            </th>
            <th scope="col" className="px-4 py-3 text-right font-semibold">
              {m.dashboard_col_reached()}
            </th>
            <th scope="col" className="px-4 py-3 text-right font-semibold">
              {m.dashboard_col_drop_off()}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.number} className="border-b border-border last:border-b-0">
              <th scope="row" className="max-w-[260px] px-4 py-3 text-left font-normal">
                <span className="font-semibold">
                  {m.chapter_number({ number: String(row.number) })}
                </span>
                {row.title ? (
                  <span className="block truncate text-muted-foreground">{row.title}</span>
                ) : null}
              </th>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="w-14 shrink-0 tabular-nums">{formatDecimal(row.views30d)}</span>
                  <span
                    aria-hidden
                    className="h-2 min-w-[80px] flex-1 overflow-hidden rounded-full bg-secondary"
                  >
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${maxViews > 0 ? (row.views30d / maxViews) * 100 : 0}%` }}
                    />
                  </span>
                </div>
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{formatDecimal(row.reached)}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                {row.dropOffPct === null
                  ? m.dashboard_no_value()
                  : m.dashboard_percent({ value: formatDecimal(row.dropOffPct) })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
