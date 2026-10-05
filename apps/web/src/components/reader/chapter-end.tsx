import type { ReportTarget } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { Button } from '@/components/ui/button';
import { ReportButton } from '../report/report-button';

/**
 * After the text: a large next-chapter button, the author's note, then a quiet report button.
 * Comments come later.
 */
export function ChapterEnd({
  nextHref,
  authorNote,
  reportTarget,
}: {
  nextHref: string | null;
  authorNote: string | null;
  reportTarget: ReportTarget;
}) {
  return (
    <footer className="mt-16 flex flex-col gap-10 border-t pt-10">
      {nextHref ? (
        <Button asChild size="lg" className="h-14 w-full text-base">
          <a href={nextHref} rel="next">
            {m.reader_end_next()}
          </a>
        </Button>
      ) : (
        <p className="text-center text-reader-muted">{m.reader_end_latest()}</p>
      )}
      {authorNote ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-reader-muted">{m.reader_author_note()}</h2>
          {/* Plain text: React escapes it; line breaks are kept by `pre-line`. */}
          <p className="whitespace-pre-line">{authorNote}</p>
        </section>
      ) : null}
      <ReportButton target={reportTarget} className="self-center text-reader-muted" />
    </footer>
  );
}
