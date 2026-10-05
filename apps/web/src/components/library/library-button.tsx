import { m } from '@novel-hub/shared/messages';
import { Link } from '@tanstack/react-router';
import { BookmarkCheckIcon, BookmarkPlusIcon, ChevronDownIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSetShelf, useShelf } from '@/lib/library';
import { useMe } from '@/lib/me';
import { SHELF_LABELS } from './shelf-labels';
import { ShelfMenu } from './shelf-menu';

/**
 * "Add to library" on the story page. The server renders the neutral button (the page is cached
 * publicly); the reader's real shelf loads in the browser. Guests are sent to sign in.
 */
export function LibraryButton({ publicId }: { publicId: string }) {
  const me = useMe();
  const signedIn = !!me.data;
  const shelf = useShelf(publicId, signedIn);
  const setShelf = useSetShelf();

  const addButton = (
    <Button
      variant="outline"
      disabled={signedIn && (shelf.isPending || setShelf.isPending)}
      onClick={signedIn ? () => setShelf.mutate({ publicId, shelf: 'reading' }) : undefined}
    >
      <BookmarkPlusIcon aria-hidden />
      {m.library_add()}
    </Button>
  );

  if (me.isPending || (signedIn && shelf.isPending)) return addButton;
  if (!signedIn) {
    return (
      <Button asChild variant="outline">
        <Link to="/sign-in">
          <BookmarkPlusIcon aria-hidden />
          {m.library_add()}
        </Link>
      </Button>
    );
  }
  if (!shelf.data) return addButton;
  return (
    <ShelfMenu
      shelf={shelf.data}
      disabled={setShelf.isPending}
      onChange={(next) => setShelf.mutate({ publicId, shelf: next })}
      trigger={
        <Button variant="outline">
          <BookmarkCheckIcon aria-hidden />
          {m.library_on_shelf({ shelf: SHELF_LABELS[shelf.data]() })}
          <ChevronDownIcon aria-hidden />
        </Button>
      }
    />
  );
}
