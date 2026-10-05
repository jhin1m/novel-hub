import type { TagView } from '@novel-hub/core';
import { canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { TagChip } from '../tag-chip';

/**
 * Genre chips at the top of the home page: "All" (this page, selected) and one link per genre.
 * One scrolling row on phones, wrapping lines from `md` up.
 */
export function HomeGenreChips({ genres }: { genres: TagView[] }) {
  return (
    <nav aria-label={m.home_genres()}>
      <ul className="-m-1 flex gap-2 overflow-x-auto p-1 md:flex-wrap md:overflow-visible">
        <li className="shrink-0">
          <a
            href={canonicalPath({ kind: 'home' })}
            aria-current="page"
            className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-[13px] font-semibold whitespace-nowrap text-primary-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
          >
            {m.home_genres_all()}
          </a>
        </li>
        {genres.map((tag) => (
          <li key={tag.slug} className="shrink-0">
            <TagChip slug={tag.slug} name={tag.name} />
          </li>
        ))}
      </ul>
    </nav>
  );
}
