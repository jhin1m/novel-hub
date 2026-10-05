import type { LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';

/**
 * Section title with an icon tile. The caller labels its region with `aria-labelledby={id}`, so
 * the region's name is only the `h2`; the subtitle sits outside it.
 */
export function SectionHeading({
  id,
  icon: Icon,
  title,
  subtitle,
  onBand = false,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  /** The section sits on the `--band` strip, where the soft accent tile would blend in. */
  onBand?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className={cn(
          'grid size-[34px] shrink-0 place-items-center rounded-[11px] text-primary',
          onBand ? 'bg-card' : 'bg-primary-soft',
        )}
      >
        <Icon className="size-[18px]" />
      </span>
      <div className="min-w-0">
        <h2 id={id} className="text-[22px] leading-tight font-extrabold tracking-tight">
          {title}
        </h2>
        {subtitle ? <p className="text-[13px] text-muted-foreground">{subtitle}</p> : null}
      </div>
    </div>
  );
}
