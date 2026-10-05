import type { ReactNode } from 'react';
import { MobileTabBar } from '@/components/mobile-tab-bar';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { cn } from '@/lib/utils';

/**
 * What sits fixed at the bottom of a narrow screen: the tab bar, a page's own sticky call to action
 * (the frame keeps the same room free so the footer is never covered), or nothing.
 */
type BottomInset = 'tabBar' | 'cta' | 'none';

/**
 * Shared page frame (header, footer, mobile tab bar). A component each page wraps itself in, not a
 * layout route, because the reader and focus-mode editor go without it. Server-rendered HTML is
 * identical for every visitor so it stays publicly cacheable.
 */
export function SiteLayout({
  children,
  bottomInset = 'tabBar',
}: {
  children: ReactNode;
  bottomInset?: BottomInset;
}) {
  return (
    <div
      className={cn(
        'flex min-h-dvh flex-col',
        bottomInset !== 'none' && 'pb-[calc(72px+env(safe-area-inset-bottom))] md:pb-0',
      )}
    >
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      {bottomInset === 'tabBar' ? <MobileTabBar /> : null}
    </div>
  );
}
