import { SHELVES, type Shelf } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import type { ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SHELF_LABELS } from './shelf-labels';

/** Move a story to another shelf or take it off the library; `trigger` opens it. */
export function ShelfMenu({
  shelf,
  onChange,
  disabled,
  trigger,
}: {
  shelf: Shelf;
  onChange: (shelf: Shelf | null) => void;
  disabled?: boolean;
  trigger: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        {trigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>{m.library_move()}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={shelf}
          onValueChange={(value) => {
            const next = SHELVES.find((s) => s === value);
            if (next && next !== shelf) onChange(next);
          }}
        >
          {SHELVES.map((s) => (
            <DropdownMenuRadioItem key={s} value={s}>
              {SHELF_LABELS[s]()}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => onChange(null)}>
          {m.library_remove()}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
