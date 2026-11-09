import { m } from '@novel-hub/shared/messages';
import { LocateFixedIcon } from 'lucide-react';
import { useEffect, useId, useMemo, useState, useSyncExternalStore } from 'react';
import { type TocChapter, type TocOrder, filterChapters, orderChapters } from '../../lib/toc';

/**
 * Search box, oldest/newest toggle and "go to the chapter I'm reading" above a table of contents.
 * `matchCount` is `null` while nothing is typed; without `onJumpToCurrent` the jump button is hidden.
 */
export function ChapterTocControls({
  query,
  onQueryChange,
  order,
  onOrderChange,
  matchCount,
  onJumpToCurrent,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  order: TocOrder;
  onOrderChange: (order: TocOrder) => void;
  matchCount: number | null;
  onJumpToCurrent?: () => void;
}) {
  const searchId = useId();
  const orders: { value: TocOrder; label: string }[] = [
    { value: 'oldest', label: m.toc_sort_oldest_first() },
    { value: 'newest', label: m.toc_sort_newest_first() },
  ];
  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={searchId} className="sr-only">
          {m.toc_search_label()}
        </label>
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={m.toc_search_placeholder()}
          autoComplete="off"
          className="h-10 min-w-[12rem] flex-1 rounded-full border border-input bg-card px-4 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring md:text-sm"
        />
        <div
          role="group"
          aria-label={m.toc_sort_label()}
          className="flex shrink-0 rounded-full bg-secondary p-1"
        >
          {orders.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={order === option.value}
              onClick={() => onOrderChange(option.value)}
              className="h-8 rounded-full px-3 text-sm font-semibold text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring aria-pressed:bg-card aria-pressed:text-foreground"
            >
              {option.label}
            </button>
          ))}
        </div>
        {onJumpToCurrent ? (
          <button
            type="button"
            onClick={onJumpToCurrent}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-bold outline-none hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring"
          >
            <LocateFixedIcon aria-hidden="true" className="size-4" />
            {m.toc_jump_current()}
          </button>
        ) : null}
      </div>
      {/* Always present, so screen readers announce the first count. */}
      <div aria-live="polite" className="px-1 text-sm text-muted-foreground">
        {matchCount === null ? null : (
          <p className="pt-2">
            {matchCount === 0 ? m.toc_no_match() : m.toc_match_count({ count: String(matchCount) })}
          </p>
        )}
      </div>
    </div>
  );
}

const subscribeNever = () => () => {};

/** `false` on the server and while hydrating, `true` after: the controls only work with JS. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}

/**
 * State of a table of contents with controls: the chapters to show for the current query and
 * order, and the props for `ChapterTocControls`. Every chapter link must carry the id
 * `${idPrefix}${number}` so jumping can scroll to it and focus it.
 */
export function useChapterTocState<T extends TocChapter>(
  chapters: readonly T[],
  current: number | null,
  idPrefix: string,
) {
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<TocOrder>('oldest');
  // A new object on each jump; scrolling waits for the render that clears the search.
  const [jump, setJump] = useState<{ number: number } | null>(null);
  const visible = useMemo(
    () => orderChapters(filterChapters(chapters, query), order),
    [chapters, query, order],
  );

  useEffect(() => {
    if (!jump) return;
    const link = document.getElementById(`${idPrefix}${jump.number}`);
    if (!link) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    link.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    link.focus({ preventScroll: true });
  }, [jump, idPrefix]);

  const canJump = current !== null && chapters.some((chapter) => chapter.number === current);
  const filtering = query.trim() !== '';
  return {
    visible,
    filtering,
    controls: {
      query,
      onQueryChange: setQuery,
      order,
      onOrderChange: setOrder,
      matchCount: filtering ? visible.length : null,
      onJumpToCurrent: canJump
        ? () => {
            setQuery('');
            setJump({ number: current });
          }
        : undefined,
    },
  };
}
