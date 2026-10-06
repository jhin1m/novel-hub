import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

/** Surface of a page's main form or text block: card colour, hairline border, 24px corners. */
export const pageCardClass = 'rounded-xl border border-border bg-card p-5 md:p-8';

/**
 * Content column of a secondary page (search, library, settings, forms...): the site's 1240px grid,
 * or a 560px column for single forms. Children stack with a fixed gap.
 */
export function PageShell({
  children,
  width = 'default',
  className,
}: {
  children: ReactNode;
  width?: 'default' | 'narrow';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mx-auto flex w-full flex-col gap-6 px-4 py-8 md:px-8 md:py-10',
        width === 'narrow' ? 'max-w-[560px]' : 'max-w-[1240px]',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The page's single `h1`, in the UI face (serif is kept for story text). */
export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="text-[28px] leading-tight font-extrabold tracking-tight">{children}</h1>;
}
