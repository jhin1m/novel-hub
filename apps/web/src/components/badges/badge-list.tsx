import type { BadgeCode } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { BADGE_DISPLAY } from './badge-icons';

/**
 * An author's milestone badges as small neutral pills (not the accent: they are not actions).
 * The description shows as a tooltip and is read out after the name. Renders nothing without
 * badges.
 */
export function BadgeList({ badges }: { badges: readonly { code: BadgeCode }[] }) {
  if (badges.length === 0) return null;
  return (
    <ul aria-label={m.badge_section_title()} className="flex flex-wrap gap-2">
      {badges.map(({ code }) => {
        const { icon: Icon, name, description } = BADGE_DISPLAY[code];
        return (
          <li
            key={code}
            title={description()}
            className="inline-flex h-7 items-center gap-1.5 rounded-full bg-secondary px-3 text-[13px] font-semibold text-secondary-foreground"
          >
            <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            {name()}
            <span className="sr-only">: {description()}</span>
          </li>
        );
      })}
    </ul>
  );
}
