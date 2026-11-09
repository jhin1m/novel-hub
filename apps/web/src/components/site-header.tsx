import { SEARCH_QUERY_MAX_LENGTH, canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { Link, useRouterState } from '@tanstack/react-router';
import { CompassIcon, LibraryBigIcon, PenLineIcon, SearchIcon, TrophyIcon } from 'lucide-react';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { SiteAccountMenu } from '@/components/site-account-menu';
import { SiteLogo } from '@/components/site-logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { activeMainTab } from '@/lib/main-nav';
import { useMe } from '@/lib/me';
import { cn } from '@/lib/utils';

/**
 * Mobile-first: below `md` the header holds only the logo, a search link and the account controls
 * (the tab bar carries the rest). From `md` everyone gets the search box and the three main links.
 */
export function SiteHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = activeMainTab(pathname);

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-2 px-safe-4 md:h-[72px] md:gap-4 md:px-safe-8">
        {/* Public pages link with full document loads so every view is served from CDN-cached HTML. */}
        <Link
          to="/"
          reloadDocument
          aria-label={m.app_name()}
          className="shrink-0 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
        >
          <SiteLogo />
        </Link>
        <HeaderSearch />
        <div className="hidden shrink-0 items-center gap-1 md:flex">
          <HeaderExploreLink active={active === 'explore'} />
          <HeaderRankingsLink active={pathname.startsWith('/rankings/')} />
          <HeaderLibraryLink active={active === 'library'} />
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-1 md:gap-2">
          <Button asChild variant="ghost" size="icon" className="md:hidden">
            <a href="/search" aria-label={m.layout_search()}>
              <SearchIcon aria-hidden className="size-5" />
            </a>
          </Button>
          <HeaderWriteLink active={active === 'write'} />
          <NotificationBell />
          <SiteAccountMenu />
        </div>
      </div>
    </header>
  );
}

/**
 * A plain GET form to `/search`, so it works before hydration and lands on a full document load.
 * Narrow screens get the search link next to the account controls instead.
 */
function HeaderSearch() {
  return (
    <form
      action="/search"
      method="get"
      role="search"
      className="relative hidden max-w-[420px] min-w-0 flex-1 md:block"
    >
      <SearchIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        name="q"
        maxLength={SEARCH_QUERY_MAX_LENGTH}
        aria-label={m.layout_search()}
        placeholder={m.layout_search_placeholder()}
        className="h-11 rounded-full pl-11"
      />
    </form>
  );
}

const NAV_PILL =
  'h-[42px] text-[15px] font-semibold aria-[current=page]:bg-primary-soft aria-[current=page]:text-primary [&_svg]:size-[18px]';

// Icon only below `xl`, where the labels would squeeze the search box; words only from `xl`.
const NAV_LINK = cn(NAV_PILL, 'has-[>svg]:px-3 xl:[&_svg]:hidden');
const NAV_LABEL = 'sr-only xl:not-sr-only';

/** The explore page (the tab bar carries it on narrow screens). A document link: its bare page is CDN-cached HTML. */
function HeaderExploreLink({ active }: { active: boolean }) {
  return (
    <Button asChild variant="ghost" className={NAV_LINK}>
      <a href="/search" aria-current={active ? 'page' : undefined}>
        <CompassIcon aria-hidden />
        <span className={NAV_LABEL}>{m.nav_explore()}</span>
      </a>
    </Button>
  );
}

/** The rankings (the footer carries them on narrow screens). A document link: ranking pages are CDN-cached HTML. */
function HeaderRankingsLink({ active }: { active: boolean }) {
  return (
    <Button asChild variant="ghost" className={NAV_LINK}>
      <a
        href={canonicalPath({ kind: 'ranking', period: 'week' })}
        aria-current={active ? 'page' : undefined}
      >
        <TrophyIcon aria-hidden />
        <span className={NAV_LABEL}>{m.ranking_nav()}</span>
      </a>
    </Button>
  );
}

/** The library, for everyone: a guest lands on its invitation to sign in, not on a redirect. */
function HeaderLibraryLink({ active }: { active: boolean }) {
  return (
    <Button asChild variant="ghost" className={NAV_LINK}>
      <Link
        to="/library"
        search={{ shelf: 'reading', page: 1 }}
        aria-current={active ? 'page' : undefined}
      >
        <LibraryBigIcon aria-hidden />
        <span className={NAV_LABEL}>{m.layout_library()}</span>
      </Link>
    </Button>
  );
}

/**
 * The way into writing, for signed-in accounts only (below `md` the tab bar carries it). While the
 * account loads it is rendered as `.signed-in-hint`: shown before paint when the browser was last
 * signed in.
 */
function HeaderWriteLink({ active }: { active: boolean }) {
  const me = useMe();
  if (!me.data && !me.isPending) return null;

  return (
    <Button
      asChild
      variant="ghost"
      className={cn(NAV_PILL, 'hidden md:inline-flex', me.isPending && 'signed-in-hint')}
    >
      <Link to="/write" aria-current={active ? 'page' : undefined}>
        <PenLineIcon aria-hidden />
        {m.layout_write()}
      </Link>
    </Button>
  );
}
