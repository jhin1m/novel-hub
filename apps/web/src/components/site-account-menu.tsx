import { m } from '@novel-hub/shared/messages';
import { Link } from '@tanstack/react-router';
import {
  LibraryBigIcon,
  LogOutIcon,
  PenLineIcon,
  SettingsIcon,
  ShieldCheckIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useMe, useSignOut } from '@/lib/me';

/**
 * Account state is only known once `useMe()` runs in the browser; SSR always renders a placeholder.
 * Writing is offered to signed-in accounts only, the moderation queue to moderators and admins.
 */
export function SiteAccountMenu() {
  const me = useMe();
  const signOut = useSignOut();

  // Same size as the account button, the common case on pages people come back to.
  if (me.isPending) return <div aria-hidden className="size-[42px] shrink-0 rounded-full" />;

  const user = me.data;
  const canModerate = user?.role === 'mod' || user?.role === 'admin';
  if (!user) {
    return (
      <nav className="flex items-center gap-1">
        <Button asChild variant="ghost" size="sm">
          <Link to="/sign-in">{m.layout_sign_in()}</Link>
        </Button>
        <Button asChild size="sm">
          <Link to="/sign-up">{m.layout_sign_up()}</Link>
        </Button>
      </nav>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="icon" className="size-[42px] text-base font-extrabold">
          {/* `Array.from` keeps a character made of two UTF-16 units whole. */}
          <span aria-hidden>{Array.from(user.displayName)[0]?.toUpperCase()}</span>
          <span className="sr-only">
            {m.layout_account_menu()}: {user.displayName}
          </span>
        </Button>
      </DropdownMenuTrigger>
      {/* The header and tab bar links are repeated here so every screen width reaches them. */}
      <DropdownMenuContent align="end">
        {canModerate ? (
          <DropdownMenuItem asChild>
            <Link to="/moderation" search={{ status: 'open', page: 1 }}>
              <ShieldCheckIcon aria-hidden />
              {m.layout_moderation()}
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link to="/write">
            <PenLineIcon aria-hidden />
            {m.layout_write()}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/library" search={{ shelf: 'reading', page: 1 }}>
            <LibraryBigIcon aria-hidden />
            {m.layout_library()}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <SettingsIcon aria-hidden />
            {m.layout_settings()}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={signOut.isPending} onSelect={() => signOut.mutate()}>
          <LogOutIcon aria-hidden />
          {m.layout_sign_out()}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
