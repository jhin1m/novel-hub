import { Link } from '@tanstack/react-router';
import type { ModerationSearch } from '@/routes/moderation';
import { cn } from '@/lib/utils';
import {
  SEGMENTED_CHIP_LIST_CLASS,
  SEGMENTED_LIST_CLASS,
  segmentedLinkClass,
} from '../segmented-link-classes';

export interface TabItem {
  key: string;
  label: string;
  search: ModerationSearch;
  current: boolean;
}

/**
 * A row of client-side links that rewrite the search params (the page is never cached): pill tabs,
 * or with `small` a wrapping row of filter chips.
 */
export function TabLinks({
  label,
  items,
  small,
}: {
  label: string;
  items: TabItem[];
  small?: boolean;
}) {
  return (
    <nav aria-label={label}>
      <ul className={cn(small ? SEGMENTED_CHIP_LIST_CLASS : SEGMENTED_LIST_CLASS)}>
        {items.map((item) => (
          <li key={item.key}>
            <Link
              to="/moderation"
              search={item.search}
              aria-current={item.current ? 'page' : undefined}
              className={segmentedLinkClass(item.current, small)}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
