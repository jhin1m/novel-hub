import { m } from '@novel-hub/shared/messages';
import { useMutation } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { FormMessage, textLinkClass } from '../components/auth-ui';
import { SiteLayout } from '../components/site-layout';
import { authClient } from '../lib/auth-client';
import { authErrorMessage, throwIfAuthError } from '../lib/auth-errors';
import { useMe, useSignOut } from '../lib/me';

export const Route = createFileRoute('/')({
  component: HomePage,
});

/** Placeholder that only shows the sign-in state until the real home page is built. */
function HomePage() {
  return (
    <SiteLayout>
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-12">
        <h1 className="font-serif text-2xl font-semibold">{m.app_name()}</h1>
        <AccountStatus />
      </div>
    </SiteLayout>
  );
}

function AccountStatus() {
  const me = useMe();
  const signOut = useSignOut();
  // Read the email from the session only on resend: `/api/v1/me` does not return it.
  const resend = useMutation({
    mutationFn: async () => {
      const { data } = await authClient.getSession();
      if (!data) throw new Error('No active session');
      const { error } = await authClient.sendVerificationEmail({
        email: data.user.email,
        callbackURL: '/',
      });
      throwIfAuthError(error);
    },
  });

  if (me.isPending) return <p>{m.home_loading()}</p>;
  if (me.isError) return <FormMessage>{m.error_generic()}</FormMessage>;

  const user = me.data;
  if (!user) {
    return (
      <section className="flex flex-col gap-2">
        <p>{m.home_guest()}</p>
        <nav className="flex gap-4">
          <Link to="/sign-in" className={textLinkClass}>
            {m.home_sign_in()}
          </Link>
          <Link to="/sign-up" className={textLinkClass}>
            {m.home_sign_up()}
          </Link>
        </nav>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
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
