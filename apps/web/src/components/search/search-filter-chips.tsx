import type { SearchQuery } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { Link } from '@tanstack/react-router';
import { CheckIcon, XIcon } from 'lucide-react';
import { useId } from 'react';
import { hasFilters } from '@/lib/search';
import { type SearchChipGroup, aiChip, chipGroups, clearedSearch } from '@/lib/search-chips';
import { cn } from '@/lib/utils';
import { SEGMENTED_CHIP_LIST_CLASS, segmentedLinkClass } from '../segmented-link-classes';

/**
 * Order and filters of the explore page as one-tap chips: each chip is a client-side link to the
 * query with that choice, back on the first page. `aria-current` comes from `chipGroups` (the router's
 * own match misses default chips and numeric-looking text); `exact` matching keeps the router from
 * also marking "any" current next to the picked chip (it compares searches partially by default).
 */
export function SearchFilterChips({
  query,
  genres,
}: {
  query: SearchQuery;
  genres: { slug: string; name: string }[];
}) {
  const ai = aiChip(query);
  const aiHintId = useId();
  return (
    <div className="flex flex-col gap-4">
      {chipGroups(query, genres).map((group) => (
        <ChipGroup key={group.key} group={group} />
      ))}
      <div className="flex flex-wrap items-center gap-1.5">
        <Link
          to="/search"
          search={ai.search}
          role="switch"
          aria-checked={ai.on}
          aria-describedby={aiHintId}
          title={m.filter_hide_ai_hint()}
          // A switch toggles with Space as well; a link only follows Enter on its own.
          onKeyDown={(event) => {
            if (event.key !== ' ') return;
            event.preventDefault();
            event.currentTarget.click();
          }}
          activeOptions={{ exact: true }}
          className={cn(segmentedLinkClass(ai.on, true), 'gap-1.5')}
        >
          {ai.on ? <CheckIcon aria-hidden className="size-3.5" /> : null}
          {m.filter_hide_ai()}
        </Link>
        <span id={aiHintId} className="sr-only">
          {m.filter_hide_ai_hint()}
        </span>
        {hasFilters(query) ? (
          <Link
            to="/search"
            search={clearedSearch(query)}
            className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-[13px] font-semibold text-primary outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring"
          >
            <XIcon aria-hidden className="size-3.5" />
            {m.search_filters_clear()}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function ChipGroup({ group }: { group: SearchChipGroup }) {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-1.5">
      <span id={labelId} className="text-[13px] font-bold text-muted-foreground">
        {group.label}
      </span>
      <ul className={SEGMENTED_CHIP_LIST_CLASS}>
        {group.chips.map((chip) => (
          <li key={chip.key}>
            <Link
              to="/search"
              search={chip.search}
              activeOptions={{ exact: true }}
              aria-current={chip.current ? 'page' : undefined}
              className={segmentedLinkClass(chip.current, true)}
            >
              {chip.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
