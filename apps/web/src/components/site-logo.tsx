import { m } from '@novel-hub/shared/messages';

/**
 * The bookmark mark and the two-tone wordmark. Purely visual: the surrounding link carries the
 * accessible name, which a screen reader would otherwise spell out as two words.
 */
export function SiteLogo() {
  return (
    <span aria-hidden className="flex items-center gap-[9px] md:gap-2.5">
      <svg viewBox="0 0 36 36" className="size-8 shrink-0 md:size-9">
        <rect width="36" height="36" rx="9" className="fill-primary" />
        <rect width="7" height="36" rx="3" className="fill-black/22" />
        <path d="M24 2 v13 l-3.5 -2.6 L17 15 V2 Z" className="fill-(--cover-fg)" />
      </svg>
      <span className="text-[23px] leading-none tracking-[-0.02em] md:text-[25px]">
        <span className="font-bold text-primary">{m.layout_logo_first()}</span>
        <span className="font-medium">{m.layout_logo_second()}</span>
      </span>
    </span>
  );
}
