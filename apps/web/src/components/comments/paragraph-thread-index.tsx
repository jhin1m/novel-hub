import { m } from '@novel-hub/shared/messages';
import type { ParagraphText } from '@/lib/reader/paragraph-elements';

/**
 * The paragraphs that have comments, in reading order: a few words of each and how many comments.
 * Choosing one opens its comments; it is also how keyboard users reach them.
 */
export function ParagraphThreadIndex({
  paragraphs,
  counts,
  onOpen,
}: {
  /** Every paragraph of the text, as read from the page. */
  paragraphs: ParagraphText[];
  counts: Record<string, number>;
  onOpen: (pid: string) => void;
}) {
  const entries = paragraphs.flatMap((paragraph) => {
    const count = counts[paragraph.pid] ?? 0;
    return count > 0 ? [{ ...paragraph, count }] : [];
  });
  // The cached page may be older than the comments: none of their paragraphs is in it.
  if (entries.length === 0) {
    return <p className="text-sm text-reader-muted">{m.comment_paragraph_index_empty()}</p>;
  }
  return (
    <ol className="flex flex-col gap-2">
      {entries.map((entry) => (
        <li key={entry.pid}>
          <button
            type="button"
            onClick={() => onOpen(entry.pid)}
            className="flex w-full flex-col gap-1 rounded-2xl bg-reader-card px-4 py-3 text-left transition-colors outline-none hover:bg-reader-card/80 focus-visible:ring-[3px] focus-visible:ring-ring"
          >
            <span className="line-clamp-2 font-serif text-[15px] leading-relaxed">
              {entry.text}
            </span>
            <span className="text-xs font-semibold text-reader-muted">
              {m.comment_paragraph_item_count({ count: entry.count })}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
