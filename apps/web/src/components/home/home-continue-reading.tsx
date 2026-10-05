import { m } from '@novel-hub/shared/messages';
import { Link } from '@tanstack/react-router';
import { continueRows } from '../../lib/home';
import { useHistory } from '../../lib/library';
import { useMe } from '../../lib/me';
import { cn } from '../../lib/utils';
import { ResumeLink } from '../library/continue-reading-button';
import { StoryCover } from '../story-cover';

/**
 * "Continue reading" beside the home hero: the reader's last few stories, each with a link back
 * to where they stopped. Loaded in the browser only (the server never reads the session), so the
 * cached HTML never holds it. Rows show the chapter number alone: numbers can skip (soft-deleted
 * or unpublished chapters), so "chapter X of Y" or "N left" would be wrong.
 */
export function HomeContinueReading() {
  const me = useMe();
  const history = useHistory(!!me.data);
  if (!me.data) return null;
  const rows = continueRows(
    history.data?.pages[0]?.items ?? [],
    me.data.preferences.showMature === true,
  );
  if (rows.length === 0) return null;

  return (
    <aside
      aria-labelledby="continue-title"
      className="flex flex-[1_1_340px] flex-col gap-3 rounded-[28px] border border-border bg-card p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="continue-title" className="text-lg font-extrabold tracking-tight">
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
