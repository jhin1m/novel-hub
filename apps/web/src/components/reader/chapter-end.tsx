import { m } from '@novel-hub/shared/messages';
import { Button } from '@/components/ui/button';

/** After the text: a large next-chapter button, then the author's note. Comments come later. */
export function ChapterEnd({
  nextHref,
  authorNote,
}: {
  nextHref: string | null;
  authorNote: string | null;
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
    </footer>
  );
}
