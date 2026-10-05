import { m } from '@novel-hub/shared/messages';
import { Link } from '@tanstack/react-router';
import { ChevronDownIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useMe, useSignOut } from '@/lib/me';

/**
 * Shared page frame (header + footer). A component each page wraps itself in, not a layout route,
 * because the reader and focus-mode editor go without the site header. Server-rendered HTML is
 * identical for every visitor so it stays publicly cacheable.
 */
export function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
        {/* Public pages link with full document loads so every view is served from CDN-cached HTML. */}
        <Link to="/" reloadDocument className="font-serif text-lg font-semibold">
          {m.app_name()}
        </Link>
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost">
            <Link to="/write">{m.layout_write()}</Link>
          </Button>
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}

/** Account state is only known once `useMe()` runs in the browser; SSR always renders a placeholder. */
function AccountMenu() {
  const me = useMe();
  const signOut = useSignOut();

  // Same height as the buttons so the header does not shift when the query resolves.
  if (me.isPending) return <div aria-hidden className="h-9 w-32" />;

  const user = me.data;
  if (!user) {
    return (
      <nav className="flex items-center gap-1">
        <Button asChild variant="ghost">
          <Link to="/sign-in">{m.layout_sign_in()}</Link>
        </Button>
        <Button asChild>
          <Link to="/sign-up">{m.layout_sign_up()}</Link>
        </Button>
      </nav>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="max-w-48">
          {/* Prefix instead of aria-label so the accessible name still contains the visible name. */}
          <span className="sr-only">{m.layout_account_menu()}: </span>
          <span className="truncate">{user.displayName}</span>
          <ChevronDownIcon aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={signOut.isPending} onSelect={() => signOut.mutate()}>
          {m.layout_sign_out()}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t">
      {/* CDN-cached HTML can hydrate after New Year, or in a different time zone than the server. */}
      <div
        suppressHydrationWarning
        className="mx-auto max-w-5xl px-4 py-6 text-sm text-muted-foreground"
      >
        {m.layout_footer_copyright({ year: String(new Date().getFullYear()), name: m.app_name() })}
      </div>
    </footer>
  );
}
