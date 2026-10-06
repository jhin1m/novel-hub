import { m } from '@novel-hub/shared/messages';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { PageShell, PageTitle } from './page-shell';
import { SiteLayout } from './site-layout';

function MessagePage({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: ReactNode;
}) {
  return (
    <SiteLayout>
      <PageShell width="narrow" className="items-start gap-4 md:py-16">
        <PageTitle>{title}</PageTitle>
        <p className="text-muted-foreground">{description}</p>
        {action}
      </PageShell>
    </SiteLayout>
  );
}

/** Router default 404 page (no matching route, or a loader threw `notFound()`). */
export function NotFoundPage() {
  return (
    <MessagePage
      title={m.notfound_title()}
      description={m.notfound_description()}
      action={
        <Button asChild variant="outline">
          <Link to="/" reloadDocument>
            {m.notfound_home()}
          </Link>
        </Button>
      }
    />
  );
}

/** Router default error page. Never shows the error message or stack. */
export function ErrorPage() {
  return (
    <MessagePage
      title={m.error_page_title()}
      description={m.error_page_description()}
      action={
        <Button variant="outline" onClick={() => window.location.reload()}>
          {m.error_page_retry()}
        </Button>
      }
    />
  );
}
