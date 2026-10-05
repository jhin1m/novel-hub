import { m } from '@novel-hub/shared/messages';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  AuthPage,
  FormMessage,
  SubmitButton,
  TextField,
  textLinkClass,
} from '../components/auth-ui';
import { Button } from '@/components/ui/button';
import { authClient } from '../lib/auth-client';
import { authErrorMessage, throwIfAuthError } from '../lib/auth-errors';
import { formText } from '../lib/form-text';
import { meQueryKey } from '../lib/me';

export const Route = createFileRoute('/sign-in')({
  head: () => ({ meta: [{ title: m.sign_in_title() }] }),
  component: SignInPage,
});

function SignInPage() {
  const navigate = useNavigate();
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
      await navigate({ to: '/' });
    },
  });
  // On success the browser leaves for Google, so only errors need handling.
  const google = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.signIn.social({ provider: 'google', callbackURL: '/' });
      throwIfAuthError(error);
    },
  });
  const error = signIn.error ?? google.error;

  return (
    <AuthPage title={m.sign_in_title()}>
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
        <Link to="/sign-up" className={textLinkClass}>
          {m.sign_in_no_account()}
        </Link>
      </nav>
    </AuthPage>
  );
}
