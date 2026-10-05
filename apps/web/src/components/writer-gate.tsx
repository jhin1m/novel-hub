import { m } from '@novel-hub/shared/messages';
import { useMutation } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { authErrorMessage, throwIfAuthError } from '@/lib/auth-errors';
import { useMe } from '@/lib/me';
import { FormMessage, textLinkClass } from './auth-ui';

/**
 * Shows the writing area only to signed-in users with a verified email (the API requires it for
 * every write). Guests get a sign-in link, unverified users a way to resend the verification mail.
 */
export function WriterGate({ children }: { children: ReactNode }) {
  const me = useMe();

  if (me.isPending) return <p className="text-muted-foreground">{m.writer_loading()}</p>;
  // A failed background refetch keeps the last known account: unmounting the editor would lose work.
  if (me.isError && me.data === undefined) return <FormMessage>{m.error_generic()}</FormMessage>;
  if (!me.data) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p>{m.writer_sign_in_required()}</p>
        <Button asChild>
          <Link to="/sign-in">{m.writer_sign_in()}</Link>
        </Button>
      </div>
    );
  }
  if (!me.data.emailVerified) return <VerifyEmailNotice />;
  return children;
}

function VerifyEmailNotice() {
  // `/api/v1/me` does not return the email; read it from the session only when resending.
  const resend = useMutation({
    mutationFn: async () => {
      const { data } = await authClient.getSession();
      if (!data) throw new Error('No active session');
      const { error } = await authClient.sendVerificationEmail({
        email: data.user.email,
        callbackURL: '/write',
      });
      throwIfAuthError(error);
    },
  });

  return (
    <div className="flex flex-col items-start gap-3">
      <p>{m.writer_verify_required()}</p>
      {resend.isSuccess ? (
        <FormMessage tone="info">{m.writer_verification_sent()}</FormMessage>
      ) : (
        <Button
          type="button"
          variant="outline"
          disabled={resend.isPending}
          onClick={() => resend.mutate()}
        >
          {m.writer_resend_verification()}
        </Button>
      )}
      {resend.isError ? <FormMessage>{authErrorMessage(resend.error)}</FormMessage> : null}
      <Link to="/" reloadDocument className={textLinkClass}>
        {m.notfound_home()}
      </Link>
    </div>
  );
}
