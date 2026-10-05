import { m } from '@novel-hub/shared/messages';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ChapterTocSheet } from './chapter-toc-sheet';

interface ReaderNavProps {
  story: { slug: string; publicId: string; title: string };
  chapterNumber: number;
  chapterLabel: string;
  prevHref: string | null;
  nextHref: string | null;
  hidden: boolean;
  inert?: boolean;
}

/**
 * Reading bar: chapter name, previous/next and table of contents, nothing else. Slides away while
 * scrolling down. Chapter links are plain anchors: every chapter view is a document load served
 * from the CDN cache.
 */
export function ReaderNav({
  story,
  chapterNumber,
  chapterLabel,
  prevHref,
  nextHref,
  hidden,
  inert,
}: ReaderNavProps) {
  return (
    <nav
      aria-label={m.reader_nav_label()}
      data-hidden={hidden || undefined}
      inert={inert}
      className="reader-nav fixed inset-x-0 top-0 z-30 border-b bg-reader-bg/95 text-reader-fg backdrop-blur-sm"
    >
      <div className="mx-auto flex h-12 max-w-3xl items-center gap-1 px-2">
        <ChapterTocSheet story={story} current={chapterNumber} />
        <p className="min-w-0 flex-1 truncate text-center text-sm">{chapterLabel}</p>
        <NavLink href={prevHref} label={m.reader_prev()} rel="prev">
          <ChevronLeftIcon />
        </NavLink>
        <NavLink href={nextHref} label={m.reader_next()} rel="next">
          <ChevronRightIcon />
        </NavLink>
      </div>
    </nav>
  );
}

function NavLink({
  href,
  label,
  rel,
  children,
}: {
  href: string | null;
  label: string;
  rel: 'prev' | 'next';
  children: ReactNode;
}) {
  if (!href) {
    return (
      <Button variant="ghost" size="icon" disabled aria-label={label}>
        {children}
      </Button>
    );
  }
  return (
    <Button asChild variant="ghost" size="icon">
      <a href={href} rel={rel} aria-label={label}>
        {children}
      </a>
    </Button>
  );
}
