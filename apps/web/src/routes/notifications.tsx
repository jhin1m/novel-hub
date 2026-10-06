import { m } from '@novel-hub/shared/messages';
import { Link, createFileRoute } from '@tanstack/react-router';
import { textLinkClass } from '../components/auth-ui';
import { NotificationList } from '../components/notifications/notification-list';
import { PageShell, PageTitle, pageCardClass } from '../components/page-shell';
import { SiteLayout } from '../components/site-layout';
import { NO_STORE } from '../lib/cache-headers';
import { useMe } from '../lib/me';
import { seo } from '../lib/seo';
import { cn } from '../lib/utils';

export const Route = createFileRoute('/notifications')({
  // Everything here is personal and loaded in the browser; the page itself is never stored.
  headers: () => NO_STORE,
  head: () => seo({ title: m.notification_title(), noindex: true }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const me = useMe();
  return (
    <SiteLayout>
      <PageShell width="narrow">
        <PageTitle>{m.notification_title()}</PageTitle>
        {me.isPending ? (
          <p role="status" className="text-muted-foreground">
            {m.library_loading()}
          </p>
        ) : me.isError ? (
          <p role="alert">{m.error_generic()}</p>
        ) : !me.data ? (
          <section className={cn(pageCardClass, 'flex flex-col gap-2')}>
            <p>{m.notification_sign_in()}</p>
            <Link to="/sign-in" className={textLinkClass}>
              {m.home_sign_in()}
            </Link>
          </section>
        ) : (
          <NotificationList />
        )}
      </PageShell>
    </SiteLayout>
  );
}
