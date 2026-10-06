import { UNREAD_BADGE_MAX } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { Link } from '@tanstack/react-router';
import { BellIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMe } from '@/lib/me';
import { useUnreadCount } from '@/lib/notifications';

/** `99+` above the badge limit. */
export function unreadBadgeText(count: number): string {
  return count > UNREAD_BADGE_MAX ? `${UNREAD_BADGE_MAX}+` : String(count);
}

/**
 * The header bell, for signed-in accounts only; links to `/notifications` with the unread count as
 * a badge. While the account is unknown (SSR, first load) it holds its 42px so the header does not
 * shift; guests get nothing, as with the account menu.
 */
export function NotificationBell() {
  const me = useMe();
  const unread = useUnreadCount(!!me.data);

  if (me.isPending) return <div aria-hidden className="size-[42px] shrink-0" />;
  if (!me.data) return null;

  const count = unread.data ?? 0;
  return (
    <Button asChild variant="ghost" size="icon" className="relative size-[42px] shrink-0">
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
