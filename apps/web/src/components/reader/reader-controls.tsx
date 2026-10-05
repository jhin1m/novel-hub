import { m } from '@novel-hub/shared/messages';
import { ChevronLeftIcon, ChevronRightIcon, ListIcon, Settings2Icon } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type ReaderPanel = 'toc' | 'settings';

interface ReaderControlsProps {
  /** `bar`: fixed to the bottom below `lg`. `rail`: vertical, on the right from `lg` up. */
  variant: 'bar' | 'rail';
  prevHref: string | null;
  nextHref: string | null;
  activePanel: ReaderPanel | null;
  onOpen: (panel: ReaderPanel, trigger: HTMLButtonElement) => void;
  hidden: boolean;
  /** Required so the 18+ screen can never be bypassed through these controls. */
  inert: boolean;
}

/**
 * Table of contents, previous/next chapter and display settings. Both variants render; CSS shows
 * one per screen size (`display: none` on the other, so each control has a single visible copy).
 * Chapter links are plain anchors: every chapter view is a document load served from the CDN.
 */
export function ReaderControls({
  variant,
  prevHref,
  nextHref,
  activePanel,
  onOpen,
  hidden,
  inert,
}: ReaderControlsProps) {
  const rail = variant === 'rail';
  const panelButton = (panel: ReaderPanel, label: string, short: string, icon: ReactNode) => (
    <Cell
      as="button"
      label={label}
      short={short}
      active={activePanel === panel}
      onClick={(event) => onOpen(panel, event.currentTarget)}
    >
      {icon}
    </Cell>
  );
  const toc = panelButton('toc', m.reader_toc(), m.reader_toc(), <ListIcon />);
  const settings = panelButton(
    'settings',
    m.reader_settings(),
    m.reader_settings_short(),
    <Settings2Icon />,
  );
  const prev = (
    <Cell href={prevHref} rel="prev" label={m.reader_prev()} short={m.reader_prev_short()}>
      <ChevronLeftIcon />
    </Cell>
  );
  const next = (
    <Cell href={nextHref} rel="next" label={m.reader_next()} short={m.reader_next_short()}>
      <ChevronRightIcon />
    </Cell>
  );

  return (
    <nav
      aria-label={m.reader_nav_label()}
      data-hidden={hidden || undefined}
      inert={inert}
      className={cn(
        'z-30 text-reader-fg',
        rail
          ? 'reader-rail fixed top-[180px] right-6 hidden flex-col gap-1 rounded-[20px] bg-reader-card p-1.5 opacity-60 focus-within:opacity-100 hover:opacity-100 lg:flex'
          : 'reader-bottom-bar fixed inset-x-0 bottom-0 grid h-[calc(72px+env(safe-area-inset-bottom))] grid-cols-4 border-t border-reader-fg/10 bg-reader-bg px-2 pb-[env(safe-area-inset-bottom)] lg:hidden',
      )}
    >
      {rail ? (
        <>
          {toc}
          {settings}
          {prev}
          {next}
        </>
      ) : (
        <>
          {toc}
          {prev}
          {next}
          {settings}
        </>
      )}
    </nav>
  );
}

const CELL =
  'flex flex-col items-center justify-center gap-1 rounded-[14px] text-[11px] font-semibold outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring [&_svg]:size-5 [&_svg]:shrink-0 lg:h-[60px] lg:w-16';

type CellProps = { label: string; short: string; children: ReactNode } & (
  | {
      as: 'button';
      active: boolean;
      onClick: (event: MouseEvent<HTMLButtonElement>) => void;
    }
  | { as?: 'link'; href: string | null; rel: 'prev' | 'next' }
);

/** One control: icon over a short word; the accessible name is the full label. */
function Cell(props: CellProps) {
  const content = (
    <>
      {props.children}
      <span aria-hidden>{props.short}</span>
    </>
  );
  if (props.as === 'button') {
    return (
      <button
        type="button"
        aria-label={props.label}
        aria-haspopup="dialog"
        aria-expanded={props.active}
        onClick={props.onClick}
        className={cn(CELL, props.active ? 'bg-primary-soft text-primary' : 'hover:bg-reader-fg/5')}
      >
        {content}
      </button>
    );
  }
  if (!props.href) {
    return (
      <button type="button" disabled aria-label={props.label} className={cn(CELL, 'opacity-40')}>
        {content}
      </button>
    );
  }
  return (
    <a
      href={props.href}
      rel={props.rel}
      aria-label={props.label}
      className={cn(CELL, 'hover:bg-reader-fg/5')}
    >
      {content}
    </a>
  );
}
