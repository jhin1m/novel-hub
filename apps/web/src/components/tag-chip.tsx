import { type TagKind, canonicalPath } from '@novel-hub/shared';
import { TriangleAlertIcon } from 'lucide-react';
import { coverColorVar } from '../lib/cover-palette';
import { cn } from '../lib/utils';

// Relative imports only: Vitest has no `@/` alias and this component is unit tested.

/**
 * Pill link to a tag page with a dot in the tag's cover colour. A plain document link, so the tag
 * page comes from the CDN-cached HTML; its accessible name is the tag name only. Content warnings
 * (`kind="warning"`) take the warning colours and an alert icon instead of the dot.
 */
export function TagChip({ slug, name, kind }: { slug: string; name: string; kind?: TagKind }) {
  const warning = kind === 'warning';
  return (
    <a
      href={canonicalPath({ kind: 'tag', slug })}
      data-kind={kind}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
        warning
          ? 'border-warning-foreground/30 bg-warning-soft text-warning-foreground hover:bg-warning-soft/80'
          : 'border-border bg-card hover:bg-secondary',
      )}
    >
      {warning ? (
        <TriangleAlertIcon aria-hidden="true" className="size-3.5 shrink-0" />
      ) : (
        // Only a numeric palette slot reaches `style`, never user text.
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: coverColorVar(slug) }}
        />
      )}
      {name}
    </a>
  );
}
