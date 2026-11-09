import { m } from '@novel-hub/shared/messages';
import { Link } from '@tanstack/react-router';
import { useEffect } from 'react';
import { CONTINUE_ROWS_MAX, rememberContinueRows } from '../../lib/account-hint';
import { continueRows } from '../../lib/home';
import { useHistory } from '../../lib/library';
import { useMe } from '../../lib/me';
import { cn } from '../../lib/utils';
import { ResumeLink } from '../library/continue-reading-button';
import { StoryCover } from '../story-cover';

const BOX = 'flex flex-[1_1_340px] flex-col gap-3 rounded-[28px] border border-border bg-card p-5';
const TITLE = 'text-lg font-extrabold tracking-tight';

/**
 * "Continue reading" beside the home hero: the reader's last few stories, each with a link back
 * to where they stopped. Loaded in the browser only (the server never reads the session), so the
 * cached HTML never holds it. Rows show the chapter number alone: numbers can skip (soft-deleted
 * or unpublished chapters), so "chapter X of Y" or "N left" would be wrong. While the account and
 * history load, a placeholder of the box holds its place (see `ContinueReadingPlaceholder`).
 */
export function HomeContinueReading() {
  const me = useMe();
  const history = useHistory(!!me.data);
  const rows = me.data
    ? continueRows(history.data?.pages[0]?.items ?? [], me.data.preferences.showMature === true)
    : [];
  const known = !!me.data && history.isSuccess;
  useEffect(() => {
    if (known) rememberContinueRows(rows.length);
  }, [known, rows.length]);

  if (me.isPending || (me.data && history.isPending)) return <ContinueReadingPlaceholder />;
  if (rows.length === 0) return null;

  return (
    <aside aria-labelledby="continue-title" className={BOX}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="continue-title" className={TITLE}>
          {m.home_continue_title()}
        </h2>
        <Link
          to="/library"
          search={{ shelf: 'reading', page: 1 }}
          className="text-[13px] font-semibold text-primary underline-offset-4 hover:underline"
        >
          {m.library_title()}
        </Link>
      </div>
      <ul className="flex flex-col gap-1">
        {rows.map((item, index) => (
          <li
            key={item.story.publicId}
            className={cn(
              'flex items-center gap-3 rounded-2xl p-2.5',
              index === 0 && 'bg-primary-soft',
            )}
          >
            <StoryCover
              title={item.story.title}
              authorName={item.story.author.displayName}
              mainTagSlug={item.story.mainTag.slug}
              coverUrl={item.story.coverUrl}
              sizes="54px"
              className="w-[54px] shrink-0 rounded-sm"
            />
            <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
              <p className="line-clamp-2 text-sm leading-snug font-bold">{item.story.title}</p>
              <p className="w-full truncate text-xs text-muted-foreground">
                {m.chapter_number({ number: String(item.chapterNumber) })}
                {item.chapterTitle ? ` · ${item.chapterTitle}` : null}
              </p>
              <ResumeLink
                story={item.story}
                number={item.chapterNumber}
                scrollPct={item.scrollPct}
                size="sm"
              />
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/**
 * The box's outline while it loads, so the hero beside it does not shrink once it appears. Shown
 * before paint only when the account hint says this browser's account had rows last time, with as
 * many rows (`.continue-hint`, `.continue-hint-row`); hidden otherwise.
 */
function ContinueReadingPlaceholder() {
  return (
    <div aria-hidden className={cn(BOX, 'continue-hint')}>
      <p className={cn(TITLE, 'py-px')}>{m.home_continue_title()}</p>
      <ul className="flex flex-col gap-1">
        {Array.from({ length: CONTINUE_ROWS_MAX }, (_, index) => (
          <li key={index} className="continue-hint-row flex items-center gap-3 rounded-2xl p-2.5">
            <span className="aspect-[2/3] w-[54px] shrink-0 rounded-sm bg-secondary" />
            <span className="flex flex-1 flex-col gap-2">
              <span className="h-4 w-4/5 rounded-full bg-secondary" />
              <span className="h-3 w-1/2 rounded-full bg-secondary" />
              <span className="h-9 w-28 rounded-full bg-secondary" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
