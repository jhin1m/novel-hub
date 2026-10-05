import type { ReportTarget } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { Button } from '@/components/ui/button';
import { formatInitial } from '@/lib/format';
import { ReportButton } from '../report/report-button';

/**
 * After the text: the author's note, a large next-chapter link, the previous chapter, then a
 * quiet report button. Comments come later.
 */
export function ChapterEnd({
  prevHref,
  nextHref,
  authorNote,
  authorName,
  reportTarget,
}: {
  prevHref: string | null;
  nextHref: string | null;
  authorNote: string | null;
  authorName: string;
  reportTarget: ReportTarget;
}) {
  return (
    <footer className="mt-16 flex flex-col gap-4 border-t border-reader-fg/10 pt-10 font-sans">
      {authorNote ? (
        <section className="mb-6 flex flex-col gap-3 rounded-[20px] bg-reader-card p-5">
          <h2 className="flex items-center gap-3 text-sm font-bold">
            <span
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary"
            >
              {formatInitial(authorName)}
            </span>
            {m.reader_author_note_by({ name: authorName })}
          </h2>
          {/* Plain text: React escapes it; line breaks are kept by `pre-line`. */}
          <p className="font-serif text-base whitespace-pre-line lg:text-[17px]">{authorNote}</p>
        </section>
      ) : null}
      {nextHref ? (
        <Button asChild size="lg" className="h-16 w-full text-base">
          <a href={nextHref} rel="next">
            {m.reader_end_next()}
          </a>
        </Button>
      ) : (
        <p className="text-center text-reader-muted">{m.reader_end_latest()}</p>
      )}
      {prevHref ? (
        <Button
          asChild
          variant="ghost"
          size="lg"
          className="w-full bg-reader-card text-reader-fg hover:bg-reader-card/80 hover:text-reader-fg"
        >
          <a href={prevHref} rel="prev">
            {m.reader_prev()}
          </a>
        </Button>
      ) : null}
      <p className="hidden text-center text-[13px] text-reader-muted lg:block">
        {m.reader_keyboard_hint()}
      </p>
      <ReportButton target={reportTarget} className="mt-4 self-center text-reader-muted" />
    </footer>
  );
}
