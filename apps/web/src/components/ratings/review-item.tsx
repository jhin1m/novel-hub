import type { ReviewDto } from '@novel-hub/core';
import { canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { formatDate, formatInitial } from '@/lib/format';
import { ReportButton } from '../report/report-button';
import { StarRow } from './star-input';

/**
 * One review: writer, score, date and text, with "report" for anyone but its writer (who edits it
 * in the form above). The text is a text node (React escapes it) with line breaks kept; never HTML.
 */
export function ReviewItem({ review }: { review: ReviewDto }) {
  const edited = review.updatedAt !== review.createdAt;
  return (
    <article className="flex gap-3">
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary"
      >
        {formatInitial(review.author.displayName)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
          <a
            href={canonicalPath({ kind: 'author', username: review.author.username })}
            className="font-bold hover:underline"
          >
            {review.author.displayName}
          </a>
          <StarRow score={review.score} />
          <time dateTime={review.updatedAt} className="text-xs text-muted-foreground">
            {formatDate(review.updatedAt)}
            {edited ? ` · ${m.rating_edited()}` : null}
          </time>
        </p>
        <p className="text-[15px] leading-relaxed break-words whitespace-pre-line">
          {review.review}
        </p>
        {review.isOwn ? null : (
          <ReportButton
            target={{ type: 'rating', ratingId: review.id }}
            className="-ml-2 self-start"
          />
        )}
      </div>
    </article>
  );
}
