import { m } from '@novel-hub/shared/messages';
import { Link, useRouterState } from '@tanstack/react-router';
import {
  CompassIcon,
  HomeIcon,
  LibraryBigIcon,
  type LucideIcon,
  PenLineIcon,
  UserRoundIcon,
} from 'lucide-react';
import { type MainTab, activeMainTab } from '@/lib/main-nav';
import { useMe } from '@/lib/me';
import { cn } from '@/lib/utils';

const TAB_LINK =
  'flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-inset aria-[current=page]:font-bold aria-[current=page]:text-primary';

/** Icon over label; the current tab's icon sits in a soft pill. */
function TabLabel({
  icon: Icon,
  label,
  current,
}: {
  icon: LucideIcon;
  label: string;
  current: boolean;
}) {
  return (
    <>
      <span
        className={cn(
          'flex h-7 w-[52px] items-center justify-center rounded-full',
          current && 'bg-primary-soft',
        )}
      >
        <Icon aria-hidden className="size-5" />
      </span>
      {label}
    </>
  );
}

/**
 * Bottom tab bar below `md`, outside the header. Each tab navigates the way the header entry to the
 * same place does: full document loads for the cached public pages, client-side for the personal
 * ones (they are never cached, and a reload would drop the React Query cache). The "me" tab shows
 * the guest target until `useMe()` resolves, so server and first client render agree.
 */
export function MobileTabBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = activeMainTab(pathname);
  const me = useMe();
  const tab = (name: MainTab) => ({
    className: TAB_LINK,
    'aria-current': active === name ? ('page' as const) : undefined,
  });

  return (
    <nav
      aria-label={m.layout_main_nav()}
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid h-[72px] grid-cols-5">
        <li>
          <Link to="/" reloadDocument {...tab('home')}>
            <TabLabel icon={HomeIcon} label={m.nav_home()} current={active === 'home'} />
          </Link>
        </li>
        <li>
          <a href="/search" {...tab('explore')}>
            <TabLabel icon={CompassIcon} label={m.nav_explore()} current={active === 'explore'} />
          </a>
        </li>
        <li>
          <Link to="/library" search={{ shelf: 'reading', page: 1 }} {...tab('library')}>
            <TabLabel
              icon={LibraryBigIcon}
              label={m.layout_library()}
              current={active === 'library'}
            />
          </Link>
        </li>
        <li>
          <Link to="/write" {...tab('write')}>
            <TabLabel icon={PenLineIcon} label={m.nav_write()} current={active === 'write'} />
          </Link>
        </li>
        <li>
          <Link to={me.data ? '/settings' : '/sign-in'} {...tab('me')}>
            <TabLabel icon={UserRoundIcon} label={m.nav_me()} current={active === 'me'} />
          </Link>
        </li>
      </ul>
    </nav>
  );
}
