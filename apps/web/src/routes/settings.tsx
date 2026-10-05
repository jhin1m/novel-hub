import { m } from '@novel-hub/shared/messages';
import { useMutation } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { FormMessage, textLinkClass } from '../components/auth-ui';
import { SiteLayout } from '../components/site-layout';
import { authClient } from '../lib/auth-client';
import { authErrorMessage, throwIfAuthError } from '../lib/auth-errors';
import { NO_STORE } from '../lib/cache-headers';
import { type MeUser, useMe, useSignOut } from '../lib/me';
import { usePatchPreferences } from '../lib/preferences';

export const Route = createFileRoute('/settings')({
  // Everything here is personal and loaded in the browser; the page itself is never stored.
  headers: () => NO_STORE,
  head: () => ({
    meta: [{ title: m.settings_title() }, { name: 'robots', content: 'noindex' }],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const me = useMe();
  return (
    <SiteLayout>
      <div className="mx-auto flex max-w-xl flex-col gap-10 px-4 py-12">
        <h1 className="font-serif text-2xl font-semibold">{m.settings_title()}</h1>
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
      </div>
    </SiteLayout>
  );
}

function GuestInvite() {
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
    <section aria-labelledby="account-title" className="flex flex-col gap-3">
      <h2 id="account-title" className="font-serif text-xl font-semibold">
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

/**
 * "Show 18+ content" (off by default). Turning it on asks the reader to state they are 18 or
 * older first (the server checks the statement too); turning it off applies at once. Either way
 * the cached account and the before-paint hint follow (`usePatchPreferences`).
 */
function MatureSetting({ user }: { user: MeUser }) {
  const patch = usePatchPreferences();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const switchId = useId();
  const confirmId = useId();
  const enabled = user.preferences.showMature;

  const enable = () =>
    patch.mutate(
      { showMature: true, confirmAdult: true },
      { onSuccess: () => setDialogOpen(false) },
    );

  return (
    <section aria-labelledby="mature-title" className="flex flex-col gap-3">
      <h2 id="mature-title" className="font-serif text-xl font-semibold">
        {m.settings_mature_title()}
      </h2>
      <div className="flex items-center gap-2">
        <Checkbox
          id={switchId}
          checked={enabled}
          disabled={patch.isPending}
          onCheckedChange={(checked) => {
            patch.reset();
            if (checked === true) {
              setConfirmed(false);
              setDialogOpen(true);
            } else {
              patch.mutate({ showMature: false });
            }
          }}
        />
        <Label htmlFor={switchId}>{m.settings_mature_label()}</Label>
      </div>
      <p className="text-sm text-muted-foreground">{m.settings_mature_hint()}</p>
      {patch.isError && !dialogOpen ? <FormMessage>{m.settings_mature_error()}</FormMessage> : null}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!patch.isPending) setDialogOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.settings_mature_dialog_title()}</DialogTitle>
            <DialogDescription>{m.settings_mature_dialog_description()}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Checkbox
              id={confirmId}
              checked={confirmed}
              onCheckedChange={(checked) => setConfirmed(checked === true)}
            />
            <Label htmlFor={confirmId}>{m.mature_confirm_adult()}</Label>
          </div>
          {patch.isError ? <FormMessage>{m.settings_mature_error()}</FormMessage> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={patch.isPending}>
                {m.settings_mature_cancel()}
              </Button>
            </DialogClose>
            <Button type="button" disabled={!confirmed || patch.isPending} onClick={enable}>
              {m.mature_enable()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
