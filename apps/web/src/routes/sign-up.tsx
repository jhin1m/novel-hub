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
import { authClient } from '../lib/auth-client';
import { authErrorMessage, throwIfAuthError } from '../lib/auth-errors';
import { formText } from '../lib/form-text';
import { meQueryKey } from '../lib/me';
import { seo } from '../lib/seo';

export const Route = createFileRoute('/sign-up')({
  head: () => seo({ title: m.sign_up_title(), noindex: true }),
  component: SignUpPage,
});

function SignUpPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const signUp = useMutation({
    mutationFn: async (form: FormData) => {
      const { error } = await authClient.signUp.email({
        name: formText(form, 'name'),
        username: formText(form, 'username'),
        email: formText(form, 'email'),
        password: formText(form, 'password'),
        callbackURL: '/',
      });
      throwIfAuthError(error);
    },
    onSuccess: async () => {
      // Reset rather than invalidate: data cached for a previous account must not show at all.
      await queryClient.resetQueries({ queryKey: meQueryKey });
      await navigate({ to: '/' });
    },
  });

  return (
    <AuthPage title={m.sign_up_title()}>
      <form
        method="post"
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          signUp.mutate(new FormData(e.currentTarget));
        }}
      >
        <TextField label={m.auth_display_name()} name="name" required maxLength={50} />
        <TextField
          label={m.auth_username()}
          hint={m.auth_username_hint()}
          name="username"
          required
          minLength={3}
          maxLength={30}
          pattern="[a-z0-9_]+"
          autoComplete="username"
        />
        <TextField label={m.auth_email()} name="email" type="email" required autoComplete="email" />
        <TextField
          label={m.auth_password()}
          hint={m.auth_password_hint()}
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
        {signUp.isError ? <FormMessage>{authErrorMessage(signUp.error)}</FormMessage> : null}
        <SubmitButton pending={signUp.isPending}>{m.sign_up_submit()}</SubmitButton>
      </form>
      <Link to="/sign-in" className={textLinkClass}>
        {m.sign_up_have_account()}
      </Link>
    </AuthPage>
  );
}
