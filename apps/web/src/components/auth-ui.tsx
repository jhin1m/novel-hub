import { m } from '@novel-hub/shared/messages';
import { type InputHTMLAttributes, type ReactNode, useId } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { SiteLayout } from './site-layout';

/** Shared frame for auth pages: site header/footer and a narrow form column. */
export function AuthPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <SiteLayout>
      <div className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-12">
        <h1 className="font-serif text-2xl font-semibold">{title}</h1>
        {children}
      </div>
    </SiteLayout>
  );
}

export function TextField({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const generatedId = useId();
  const id = input.id ?? generatedId;
  const hintId = `${id}-hint`;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input {...input} id={id} aria-describedby={hint ? hintId : undefined} />
      {hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <Button type="submit" disabled={pending}>
      {pending ? m.auth_submitting() : children}
    </Button>
  );
}

/** Message under a form; `tone="info"` for success notices so they are not styled as errors. */
export function FormMessage({
  tone = 'error',
  children,
}: {
  tone?: 'error' | 'info';
  children: ReactNode;
}) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('text-sm', tone === 'error' && 'text-destructive')}
    >
      {children}
    </p>
  );
}

/** Classes for inline text links (accent colour, underline on hover/focus). */
export const textLinkClass =
  'text-primary underline-offset-4 hover:underline focus-visible:underline';
