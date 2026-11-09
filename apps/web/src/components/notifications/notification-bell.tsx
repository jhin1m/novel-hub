import { UNREAD_BADGE_MAX } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { Link } from '@tanstack/react-router';
import { BellIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMe } from '@/lib/me';
import { cn } from '@/lib/utils';
import { useUnreadCount } from '@/lib/notifications';

/** `99+` above the badge limit. */
export function unreadBadgeText(count: number): string {
  return count > UNREAD_BADGE_MAX ? `${UNREAD_BADGE_MAX}+` : String(count);
}

/**
 * The header bell, for signed-in accounts only; links to `/notifications` with the unread count as
 * a badge. Below `md` guests get an empty 42px slot, so the icons keep their place whatever the
 * account state; from `md` the slot takes no room, the guest links need it next to the search box.
 * While the account loads (SSR, first load) the slot holds the bell as `.signed-in-hint`, shown
 * before paint when the browser was last signed in.
 */
export function NotificationBell() {
  const me = useMe();
  const unread = useUnreadCount(!!me.data);

  if (me.data) return <BellLink count={unread.data ?? 0} />;
  return (
    <div className="size-[42px] shrink-0 md:contents">
      {me.isPending ? <BellLink count={0} className="signed-in-hint" /> : null}
    </div>
  );
}

function BellLink({ count, className }: { count: number; className?: string }) {
  return (
    <Button
      asChild
      variant="ghost"
      size="icon"
      className={cn('relative size-[42px] shrink-0', className)}
    >
      <Link to="/notifications">
        <BellIcon aria-hidden className="size-5" />
        <span className="sr-only">
          {count > 0
            ? m.notification_bell_unread({ count: unreadBadgeText(count) })
            : m.notification_title()}
        </span>
        {count > 0 ? (
          <span
            aria-hidden
            className="absolute top-1 right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] leading-none font-bold text-primary-foreground"
          >
            {unreadBadgeText(count)}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}
