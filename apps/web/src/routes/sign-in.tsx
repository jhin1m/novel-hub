import { m } from '@novel-hub/shared/messages';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, createFileRoute, useRouter } from '@tanstack/react-router';
import {
  AuthPage,
  FormMessage,
  SubmitButton,
  TextField,
  textLinkClass,
} from '../components/auth-ui';
import { SignInReasonNotice } from '../components/sign-in-prompt-link';
import { Button } from '@/components/ui/button';
import { authClient } from '../lib/auth-client';
import { authErrorMessage, throwIfAuthError } from '../lib/auth-errors';
import { formText } from '../lib/form-text';
import { meQueryKey } from '../lib/me';
import { safeRedirectPath, signInSearchSchema } from '../lib/safe-redirect';
import { seo } from '../lib/seo';

export const Route = createFileRoute('/sign-in')({
  // `?redirect=` is where to go back to after signing in, `?reason=` why sign-in was asked for.
  validateSearch: signInSearchSchema,
  head: () => seo({ title: m.sign_in_title(), noindex: true }),
  component: SignInPage,
});

function SignInPage() {
  const search = Route.useSearch();
  const target = safeRedirectPath(search.redirect);
  const router = useRouter();
  const queryClient = useQueryClient();
  const signIn = useMutation({
    mutationFn: async (form: FormData) => {
      const { error } = await authClient.signIn.email({
        email: formText(form, 'email'),
        password: formText(form, 'password'),
      });
      throwIfAuthError(error);
    },
    onSuccess: async () => {
      // Reset rather than invalidate: data cached for a previous account must not show at all.
      await queryClient.resetQueries({ queryKey: meQueryKey });
      router.history.push(target);
    },
  });
  // On success the browser leaves for Google, so only errors need handling.
  const google = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.signIn.social({ provider: 'google', callbackURL: target });
      throwIfAuthError(error);
    },
  });
  const error = signIn.error ?? google.error;

  return (
    <AuthPage title={m.sign_in_title()}>
      <SignInReasonNotice reason={search.reason} />
      <form
        method="post"
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          signIn.mutate(new FormData(e.currentTarget));
        }}
      >
        <TextField label={m.auth_email()} name="email" type="email" required autoComplete="email" />
        <TextField
          label={m.auth_password()}
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
        {error ? <FormMessage>{authErrorMessage(error)}</FormMessage> : null}
        <SubmitButton pending={signIn.isPending}>{m.sign_in_submit()}</SubmitButton>
      </form>
      <Button
        type="button"
        variant="outline"
        disabled={google.isPending}
        onClick={() => google.mutate()}
      >
        {m.sign_in_google()}
      </Button>
      <nav className="flex flex-col gap-2">
        <Link to="/forgot-password" className={textLinkClass}>
          {m.sign_in_forgot()}
        </Link>
        <Link to="/sign-up" search={search} className={textLinkClass}>
          {m.sign_in_no_account()}
        </Link>
      </nav>
    </AuthPage>
  );
}
