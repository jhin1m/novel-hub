/** The five sections of the mobile tab bar, in display order. */
export const MAIN_TABS = ['home', 'explore', 'library', 'write', 'me'] as const;

export type MainTab = (typeof MAIN_TABS)[number];

/** Whether `pathname` is `section` itself or a page below it (`/write/stories/x` is in `/write`). */
function isIn(pathname: string, section: string): boolean {
  return pathname === section || pathname.startsWith(`${section}/`);
}

/**
 * The tab (and header link) the current page belongs to, from the path alone so server and client
 * agree. Sign-in counts as "me": it is where that tab leads guests. Story, tag and author pages
 * belong to no tab.
 */
export function activeMainTab(pathname: string): MainTab | null {
  if (pathname === '/') return 'home';
  if (isIn(pathname, '/search')) return 'explore';
  if (isIn(pathname, '/library')) return 'library';
  if (isIn(pathname, '/write')) return 'write';
  if (isIn(pathname, '/settings') || isIn(pathname, '/sign-in')) return 'me';
  return null;
}
