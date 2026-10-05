import { SEARCH_QUERY_MAX_LENGTH, canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { Link } from '@tanstack/react-router';
import { ChevronDownIcon, LibraryBigIcon, SearchIcon, SettingsIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
          <HeaderSearch />
          <Button asChild variant="ghost">
            <Link to="/settings">
              <SettingsIcon aria-hidden />
              <span className="sr-only sm:not-sr-only">{m.layout_settings()}</span>
            </Link>
          </Button>
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}

/**
 * A plain GET form to `/search`, so it works before hydration and lands on a full document load.
 * Narrow screens get a link to the search page instead of a field.
 */
function HeaderSearch() {
  return (
    <>
      <form action="/search" method="get" role="search" className="hidden md:block">
        <Input
          type="search"
          name="q"
          maxLength={SEARCH_QUERY_MAX_LENGTH}
          aria-label={m.layout_search()}
          placeholder={m.layout_search_placeholder()}
          className="h-9 w-48 lg:w-64"
        />
      </form>
      <Button asChild variant="ghost" size="icon" className="md:hidden">
        <a href="/search" aria-label={m.layout_search()}>
          <SearchIcon aria-hidden />
        </a>
      </Button>
    </>
  );
}

/**
 * Account state is only known once `useMe()` runs in the browser; SSR always renders a placeholder.
 * Writing is offered to signed-in accounts only.
 */
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
    <>
      <Button asChild variant="ghost">
        <Link to="/library" search={{ shelf: 'reading', page: 1 }}>
          <LibraryBigIcon aria-hidden />
          <span className="sr-only sm:not-sr-only">{m.layout_library()}</span>
        </Link>
      </Button>
      <Button asChild variant="ghost">
        <Link to="/write">{m.layout_write()}</Link>
      </Button>
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
    </>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t">
      {/* CDN-cached HTML can hydrate after New Year, or in a different time zone than the server. */}
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted-foreground">
        <p suppressHydrationWarning>
          {m.layout_footer_copyright({
            year: String(new Date().getFullYear()),
            name: m.app_name(),
          })}
        </p>
        <nav aria-label={m.layout_footer_nav()} className="flex gap-4">
          <a
            href={canonicalPath({ kind: 'static', path: '/terms' })}
            className="underline-offset-4 hover:underline"
          >
            {m.layout_terms()}
          </a>
          <a
            href={canonicalPath({ kind: 'static', path: '/content-policy' })}
            className="underline-offset-4 hover:underline"
          >
            {m.layout_content_policy()}
          </a>
        </nav>
      </div>
    </footer>
  );
}
