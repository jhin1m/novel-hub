import { m } from '@novel-hub/shared/messages';
import { useMutation } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { FormMessage, textLinkClass } from '../components/auth-ui';
import { PageShell, PageTitle, pageCardClass } from '../components/page-shell';
import { MatureSetting, SETTINGS_HEADING_CLASS } from '../components/settings/mature-setting';
import { SiteLayout } from '../components/site-layout';
import { authClient } from '../lib/auth-client';
import { authErrorMessage, throwIfAuthError } from '../lib/auth-errors';
import { NO_STORE } from '../lib/cache-headers';
import { type MeUser, useMe, useSignOut } from '../lib/me';
import { seo } from '../lib/seo';
import { cn } from '../lib/utils';

export const Route = createFileRoute('/settings')({
  // Everything here is personal and loaded in the browser; the page itself is never stored.
  headers: () => NO_STORE,
  head: () => seo({ title: m.settings_title(), noindex: true }),
  component: SettingsPage,
});

function SettingsPage() {
  const me = useMe();
  return (
    <SiteLayout>
      <PageShell width="narrow">
        <PageTitle>{m.settings_title()}</PageTitle>
        {me.isPending ? (
          <p>{m.home_loading()}</p>
        ) : me.isError ? (
          <FormMessage>{m.error_generic()}</FormMessage>
        ) : me.data ? (
          <>
            <AccountStatus user={me.data} />
            <MatureSetting user={me.data} />
          </>
        ) : (
          <GuestInvite />
        )}
      </PageShell>
    </SiteLayout>
  );
}

function GuestInvite() {
  return (
    <section className={cn(pageCardClass, 'flex flex-col gap-2')}>
      <p>{m.home_guest()}</p>
      <nav className="flex gap-4">
        <Link to="/sign-in" className={textLinkClass}>
          {m.home_sign_in()}
        </Link>
        <Link to="/sign-up" className={textLinkClass}>
          {m.home_sign_up()}
        </Link>
      </nav>
      <p className="text-sm text-muted-foreground">{m.settings_mature_guest()}</p>
    </section>
  );
}

function AccountStatus({ user }: { user: MeUser }) {
  const signOut = useSignOut();
  // Read the email from the session only on resend: `/api/v1/me` does not return it.
  const resend = useMutation({
    mutationFn: async () => {
      const { data } = await authClient.getSession();
      if (!data) throw new Error('No active session');
      const { error } = await authClient.sendVerificationEmail({
        email: data.user.email,
        callbackURL: '/settings',
      });
      throwIfAuthError(error);
    },
  });

  return (
    <section aria-labelledby="account-title" className={cn(pageCardClass, 'flex flex-col gap-3')}>
      <h2 id="account-title" className={SETTINGS_HEADING_CLASS}>
        {m.settings_account()}
      </h2>
      <p>{m.home_greeting({ name: user.displayName })}</p>
      <p>{m.home_username({ username: user.username })}</p>
      {user.emailVerified ? (
        <p>{m.home_email_verified()}</p>
      ) : (
        <div className="flex flex-col gap-2">
          <p>{m.home_email_unverified()}</p>
          {resend.isSuccess ? (
            <FormMessage tone="info">{m.home_verification_sent()}</FormMessage>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="self-start"
              disabled={resend.isPending}
              onClick={() => resend.mutate()}
            >
              {m.home_resend_verification()}
            </Button>
          )}
          {resend.isError ? <FormMessage>{authErrorMessage(resend.error)}</FormMessage> : null}
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        className="self-start"
        disabled={signOut.isPending}
        onClick={() => signOut.mutate()}
      >
        {m.home_sign_out()}
      </Button>
    </section>
  );
}
