import { m } from '@novel-hub/shared/messages';
import type { InputHTMLAttributes, ReactNode } from 'react';

/** Khung tối giản cho các trang auth. Chưa có design tokens nên chỉ dùng bố cục. */
export function AuthPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children}
    </main>
  );
}

export function TextField({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1">
      <span>{label}</span>
      <input className="rounded border px-3 py-2" {...input} />
      {hint ? <span className="text-sm opacity-70">{hint}</span> : null}
    </label>
  );
}

export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <button type="submit" disabled={pending} className="rounded border px-3 py-2">
      {pending ? m.auth_submitting() : children}
    </button>
  );
}

export function FormMessage({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-sm">
      {children}
    </p>
  );
}
