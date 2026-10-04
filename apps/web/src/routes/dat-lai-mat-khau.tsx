import { m } from '@novel-hub/shared/messages';
import { useMutation } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { AuthPage, FormMessage, SubmitButton, TextField } from '../components/auth-ui';
import { authClient } from '../lib/auth-client';
import { authErrorMessage, throwIfAuthError } from '../lib/auth-errors';
import { formText } from '../lib/form-text';

// Better Auth chuyển hướng về đây kèm `?token=` (link hợp lệ) hoặc `?error=INVALID_TOKEN`.
const searchSchema = z.object({
  token: z.string().optional().catch(undefined),
  error: z.string().optional().catch(undefined),
});

export const Route = createFileRoute('/dat-lai-mat-khau')({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: m.reset_title() }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token, error } = Route.useSearch();
  const reset = useMutation({
    mutationFn: async (form: FormData) => {
      const { error: resetError } = await authClient.resetPassword({
        newPassword: formText(form, 'newPassword'),
        token,
      });
      throwIfAuthError(resetError);
    },
  });

  if (!token || error) {
    return (
      <AuthPage title={m.reset_title()}>
        <FormMessage>{m.reset_invalid_link()}</FormMessage>
        <Link to="/quen-mat-khau">{m.forgot_title()}</Link>
      </AuthPage>
    );
  }

  return (
    <AuthPage title={m.reset_title()}>
      {reset.isSuccess ? (
        <>
          <FormMessage>{m.reset_done()}</FormMessage>
          <Link to="/dang-nhap">{m.sign_in_title()}</Link>
        </>
      ) : (
        <form
          method="post"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            reset.mutate(new FormData(e.currentTarget));
          }}
        >
          <TextField
            label={m.auth_new_password()}
            hint={m.auth_password_hint()}
            name="newPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
          {reset.isError ? <FormMessage>{authErrorMessage(reset.error)}</FormMessage> : null}
          <SubmitButton pending={reset.isPending}>{m.reset_submit()}</SubmitButton>
        </form>
      )}
    </AuthPage>
  );
}
