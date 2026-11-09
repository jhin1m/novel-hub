import type { LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';

/**
 * Section title, with an icon tile or (no `icon`) as the larger plain title of the story page. The
 * caller labels its region with `aria-labelledby={id}`, so the region's name is only the `h2`; the
 * subtitle sits outside it.
 */
export function SectionHeading({
  id,
  icon: Icon,
  title,
  subtitle,
  onBand = false,
}: {
  id: string;
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  /** The section sits on the `--band` strip, where the soft accent tile would blend in. */
  onBand?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      {Icon ? (
        <span
          aria-hidden="true"
          className={cn(
            'grid size-[34px] shrink-0 place-items-center rounded-[11px] text-primary',
            onBand ? 'bg-card' : 'bg-primary-soft',
          )}
        >
          <Icon className="size-[18px]" />
        </span>
      ) : null}
      <div className="min-w-0">
        <h2
          id={id}
          className={cn(
            'tracking-tight',
            Icon ? 'text-[22px] font-extrabold' : 'text-xl font-bold md:text-[26px]',
            // After the sizes: `cn` drops a line height that a later font size would override.
            'leading-tight',
          )}
        >
          {title}
        </h2>
        {subtitle ? <p className="text-[13px] text-muted-foreground">{subtitle}</p> : null}
      </div>
    </div>
  );
}
