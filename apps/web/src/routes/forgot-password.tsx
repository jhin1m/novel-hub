import { m } from '@novel-hub/shared/messages';
import { useMutation } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
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

export const Route = createFileRoute('/forgot-password')({
  head: () => ({ meta: [{ title: m.forgot_title() }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const request = useMutation({
    mutationFn: async (form: FormData) => {
      const { error } = await authClient.requestPasswordReset({
        email: formText(form, 'email'),
        redirectTo: '/reset-password',
      });
      throwIfAuthError(error);
    },
  });

  return (
    <AuthPage title={m.forgot_title()}>
      {request.isSuccess ? (
        <FormMessage tone="info">{m.forgot_sent()}</FormMessage>
      ) : (
        <form
          method="post"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            request.mutate(new FormData(e.currentTarget));
          }}
        >
          <p>{m.forgot_description()}</p>
          <TextField
            label={m.auth_email()}
            name="email"
            type="email"
            required
            autoComplete="email"
          />
          {request.isError ? <FormMessage>{authErrorMessage(request.error)}</FormMessage> : null}
          <SubmitButton pending={request.isPending}>{m.forgot_submit()}</SubmitButton>
        </form>
      )}
      <Link to="/sign-in" className={textLinkClass}>
        {m.sign_in_title()}
      </Link>
    </AuthPage>
  );
}
