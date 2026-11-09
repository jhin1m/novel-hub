import { SEARCH_QUERY_MAX_LENGTH, canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { Link, useRouterState } from '@tanstack/react-router';
import { CompassIcon, LibraryBigIcon, PenLineIcon, SearchIcon, TrophyIcon } from 'lucide-react';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { SiteAccountMenu } from '@/components/site-account-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { type MainTab, activeMainTab } from '@/lib/main-nav';
import { useMe } from '@/lib/me';
import { cn } from '@/lib/utils';

/**
 * Mobile-first: below `md` the header holds only the logo, a search link and the account controls
 * (the tab bar carries the rest), and below `sm` the logo shrinks to its mark so a guest's header
 * fits a 360px screen.
 */
export function SiteHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = activeMainTab(pathname);

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-[60px] max-w-[1240px] items-center gap-2 px-safe-4 md:h-[76px] md:gap-4 md:px-safe-8">
        {/* Public pages link with full document loads so every view is served from CDN-cached HTML. */}
        <Link
          to="/"
          reloadDocument
          className="flex shrink-0 items-center gap-2.5 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
        >
          <span
            aria-hidden
            className="flex size-[34px] items-center justify-center rounded-[10px] bg-primary font-serif text-lg font-bold text-primary-foreground"
          >
            S
          </span>
          {/* Kept for screen readers below `sm`, so the link is still named "SayNovel". */}
          <span className="sr-only text-[19px] font-extrabold tracking-tight sm:not-sr-only">
            {m.app_name()}
          </span>
        </Link>
        <HeaderSearch />
        <HeaderExploreLink active={active === 'explore'} />
        <HeaderRankingsLink active={pathname.startsWith('/rankings/')} />
        <div className="ml-auto flex min-w-0 items-center gap-1 md:gap-2">
          <Button asChild variant="ghost" size="icon" className="md:hidden">
            <a href="/search" aria-label={m.layout_search()}>
              <SearchIcon aria-hidden className="size-5" />
            </a>
          </Button>
          <HeaderNav active={active} />
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
      className="relative hidden max-w-[440px] min-w-0 flex-1 md:block"
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
        className="rounded-full pl-11"
      />
    </form>
  );
}

const NAV_PILL =
  'h-[42px] aria-[current=page]:bg-primary-soft aria-[current=page]:text-primary [&_svg]:size-[18px]';

/**
 * The explore page for everyone on desktop (the tab bar carries it on narrow screens). A document
 * link like the rankings: its bare page is CDN-cached HTML. Icon only until `lg`.
 */
function HeaderExploreLink({ active }: { active: boolean }) {
  return (
    <Button asChild variant="ghost" className={cn(NAV_PILL, 'hidden shrink-0 md:inline-flex')}>
      <a href="/search" aria-current={active ? 'page' : undefined}>
        <CompassIcon aria-hidden />
        <span className="sr-only lg:not-sr-only">{m.nav_explore()}</span>
      </a>
    </Button>
  );
}

/**
 * The way into the rankings for everyone on desktop, next to the search box (the footer carries it
 * on narrow screens). A document link: ranking pages are CDN-cached HTML. Icon only until `2xl`, so
 * the search box keeps its full width next to "Khám phá" and the signed-in links.
 */
function HeaderRankingsLink({ active }: { active: boolean }) {
  return (
    <Button asChild variant="ghost" className={cn(NAV_PILL, 'hidden shrink-0 md:inline-flex')}>
      <a
        href={canonicalPath({ kind: 'ranking', period: 'week' })}
        aria-current={active ? 'page' : undefined}
      >
        <TrophyIcon aria-hidden />
        <span className="sr-only 2xl:not-sr-only">{m.ranking_nav()}</span>
      </a>
    </Button>
  );
}

/**
 * Desktop links to the personal sections, for signed-in accounts only (guests reach them through
 * sign-in). Below `md` the tab bar and the account menu carry them. While the account loads they
 * are rendered as `.signed-in-hint`: shown before paint when the browser was last signed in.
 */
function HeaderNav({ active }: { active: MainTab | null }) {
  const me = useMe();
  if (!me.data && !me.isPending) return null;

  return (
    <div className={cn('hidden items-center gap-1 md:flex', me.isPending && 'signed-in-hint')}>
      <Button asChild variant="ghost" className={NAV_PILL}>
        <Link
          to="/library"
          search={{ shelf: 'reading', page: 1 }}
          aria-current={active === 'library' ? 'page' : undefined}
        >
          <LibraryBigIcon aria-hidden />
          {m.layout_library()}
        </Link>
      </Button>
      <Button asChild variant="ghost" className={NAV_PILL}>
        <Link to="/write" aria-current={active === 'write' ? 'page' : undefined}>
          <PenLineIcon aria-hidden />
          {m.layout_write()}
        </Link>
      </Button>
    </div>
  );
}
