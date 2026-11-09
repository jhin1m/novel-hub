import { m } from '@novel-hub/shared/messages';
import { Link } from '@tanstack/react-router';
import type { AuthorChapterView } from '@/lib/chapters';
import { ChapterStatusBadge } from '../status-badges';
import { DeleteChapterDialog } from './delete-chapter-dialog';

// The writing area is never publicly cached, so the browser's own time zone is fine here.
const dateFormat = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * One chapter on the story management page, as a card like the story cards on `/write`. The link
 * is stretched over the card; the delete button sits above it with a name of its own.
 */
export function ChapterListItem({
  publicId,
  chapter,
}: {
  publicId: string;
  chapter: AuthorChapterView;
}) {
  const numberText = m.chapter_number({ number: String(chapter.number) });
  const titleText = chapter.title ?? m.chapter_untitled();
  return (
    <li className="relative flex items-center gap-3 rounded-[18px] border border-border bg-card p-3 transition-colors hover:border-primary/40 md:gap-4 md:p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Link
          to="/write/stories/$publicId/chapters/$number"
          params={{ publicId, number: String(chapter.number) }}
          // The two lines would be read with a stray space before the colon.
          aria-label={`${numberText}: ${titleText}`}
          className="flex min-w-0 flex-col gap-0.5 underline-offset-4 outline-hidden after:absolute after:inset-0 after:rounded-[18px] hover:underline focus-visible:after:ring-[3px] focus-visible:after:ring-ring"
        >
          <span className="text-xs font-bold text-muted-foreground tabular-nums">{numberText}</span>
          <span
            className={
              chapter.title ? 'truncate font-bold' : 'truncate font-bold text-muted-foreground'
            }
          >
            {titleText}
          </span>
        </Link>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <ChapterStatusBadge status={chapter.status} />
          <span className="text-xs text-muted-foreground">
            {m.chapter_updated_at({
              date: dateFormat.format(new Date(chapter.draftUpdatedAt ?? chapter.updatedAt)),
            })}
          </span>
        </div>
      </div>
      {/* The API refuses to delete a chapter a moderator hid. */}
      {chapter.status === 'hidden_by_mod' ? null : (
        <DeleteChapterDialog publicId={publicId} chapter={chapter} />
      )}
    </li>
  );
}
