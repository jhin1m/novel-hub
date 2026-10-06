import type { ChapterStatsRow } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChapterStatsTable, pageChapterStats } from './chapter-stats-table';

/** The per-chapter part of the dashboard: the table a page at a time, and how drop-off is counted. */
export function ChapterStatsSection({ chapters }: { chapters: readonly ChapterStatsRow[] }) {
  const [requested, setPage] = useState(1);
  if (chapters.length === 0) {
    return <p className="text-muted-foreground">{m.dashboard_empty()}</p>;
  }
  const { rows, page, totalPages } = pageChapterStats(chapters, requested);
  // Over the whole story, so a bar means the same on every page.
  const maxViews = Math.max(...chapters.map((c) => c.views30d));

  return (
    <div className="flex flex-col gap-4">
      <ChapterStatsTable rows={rows} maxViews={maxViews} />
      {totalPages > 1 ? (
        <nav aria-label={m.pagination_label()} className="flex items-center justify-between gap-4">
          <Button
            type="button"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeftIcon aria-hidden />
            {m.pagination_prev()}
          </Button>
          <span className="text-sm text-muted-foreground tabular-nums">
            {m.pagination_status({ page: String(page), total: String(totalPages) })}
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            {m.pagination_next()}
            <ChevronRightIcon aria-hidden />
          </Button>
        </nav>
      ) : null}
      <p className="text-xs text-muted-foreground">{m.dashboard_drop_off_note()}</p>
    </div>
  );
}
