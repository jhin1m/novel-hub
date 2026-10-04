import { m } from '@novel-hub/shared/messages';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { FormMessage } from '../components/auth-ui';
import { authClient } from '../lib/auth-client';
import { authErrorMessage, throwIfAuthError } from '../lib/auth-errors';
import { meQueryKey, useMe } from '../lib/me';

export const Route = createFileRoute('/')({
  component: HomePage,
});

/** Tạm thời chỉ hiện trạng thái đăng nhập; trang chủ thật làm ở Giai đoạn 1. */
function HomePage() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-12">
      <h1 className="text-2xl font-semibold">{m.app_name()}</h1>
      <AccountStatus />
    </main>
  );
}

function AccountStatus() {
  const queryClient = useQueryClient();
  const me = useMe();
  const signOut = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.signOut();
      throwIfAuthError(error);
    },
    onSuccess: () => queryClient.setQueryData(meQueryKey, null),
  });
  // Lấy email từ session chỉ khi bấm gửi lại: `/api/v1/me` không trả email.
  const resend = useMutation({
    mutationFn: async () => {
      const { data } = await authClient.getSession();
      if (!data) throw new Error('Không có phiên');
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
          <Link to="/dang-nhap">{m.home_sign_in()}</Link>
          <Link to="/dang-ky">{m.home_sign_up()}</Link>
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
            <FormMessage>{m.home_verification_sent()}</FormMessage>
          ) : (
            <button
              type="button"
              className="self-start rounded border px-3 py-2"
              disabled={resend.isPending}
              onClick={() => resend.mutate()}
            >
              {m.home_resend_verification()}
            </button>
          )}
          {resend.isError ? <FormMessage>{authErrorMessage(resend.error)}</FormMessage> : null}
        </div>
      )}
      <button
        type="button"
        className="self-start rounded border px-3 py-2"
        disabled={signOut.isPending}
        onClick={() => signOut.mutate()}
      >
        {m.home_sign_out()}
      </button>
    </section>
  );
}
