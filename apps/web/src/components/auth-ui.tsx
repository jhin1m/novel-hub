import { m } from '@novel-hub/shared/messages';
import { CircleCheckIcon } from 'lucide-react';
import { type InputHTMLAttributes, type ReactNode, useId } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { PageShell, PageTitle, pageCardClass } from './page-shell';
import { SiteLayout } from './site-layout';

/** Shared frame for auth pages: site header/footer and one centred card holding the form. */
export function AuthPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <SiteLayout>
      <PageShell width="narrow" className="max-w-[480px] md:py-14">
        <div className={cn(pageCardClass, 'flex flex-col gap-6')}>
          <PageTitle>{title}</PageTitle>
          {children}
        </div>
      </PageShell>
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

/**
 * Message under a form, one node so a form never holds two alerts: errors are plain red text,
 * `tone="info"` success notices sit on the soft accent with a check mark.
 */
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
      className={cn(
        'text-sm',
        tone === 'error'
          ? 'font-semibold text-destructive'
          : 'flex items-start gap-2 rounded-md bg-primary-soft px-3.5 py-3 text-foreground',
      )}
    >
      {tone === 'info' ? (
        <CircleCheckIcon aria-hidden className="mt-px size-4 shrink-0 text-primary" />
      ) : null}
      {children}
    </p>
  );
}

/** Classes for inline text links (accent colour, underline on hover/focus). */
export const textLinkClass =
  'text-primary underline-offset-4 hover:underline focus-visible:underline';
