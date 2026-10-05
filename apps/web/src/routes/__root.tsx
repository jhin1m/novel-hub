import { m } from '@novel-hub/shared/messages';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';
import beVietnamProLatin from '@fontsource/be-vietnam-pro/files/be-vietnam-pro-latin-400-normal.woff2?url';
import beVietnamProVietnamese from '@fontsource/be-vietnam-pro/files/be-vietnam-pro-vietnamese-400-normal.woff2?url';
import literataLatin from '@fontsource-variable/literata/files/literata-latin-wght-normal.woff2?url';
import literataVietnamese from '@fontsource-variable/literata/files/literata-vietnamese-wght-normal.woff2?url';
import { BOOT_SCRIPT } from '../lib/boot-script';
import { rootSeo } from '../lib/seo';
import { getSiteConfig } from '../server-fns/site-config';
import appCss from '../styles/app.css?url';

// Preload the UI font (400) and the content font, latin + vietnamese subsets. The `?url` imports
// resolve to the same files `app.css` references, so the browser reuses the preloaded copies.
const PRELOAD_FONTS = [
  literataLatin,
  literataVietnamese,
  beVietnamProLatin,
  beVietnamProVietnamese,
];

export const Route = createRootRoute({
  // The site origin for absolute URLs in every page head. Read once: it never changes at runtime.
  loader: () => getSiteConfig(),
  staleTime: Infinity,
  // Defaults that leaf routes override tag by tag (the deepest `name`/`property` wins).
  head: ({ matches, loaderData }) => {
    const failed = matches.some((match) => match.status !== 'success' || match._notFound);
    const defaults = rootSeo(loaderData, failed);
    return {
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        ...defaults.meta,
        { property: 'og:site_name', content: m.app_name() },
        { property: 'og:locale', content: 'vi_VN' },
      ],
      links: [
        { rel: 'stylesheet', href: appCss },
        ...PRELOAD_FONTS.map((href) => ({
          rel: 'preload',
          as: 'font',
          type: 'font/woff2',
          href,
          crossOrigin: 'anonymous' as const,
        })),
      ],
    };
  },
  shellComponent: RootShell,
});

/**
 * Document shell. Also wraps the root route's error and not-found components (which replace the
 * route component), so the QueryClient lives here for `SiteLayout` to use on those pages too.
 */
function RootShell({ children }: { children: ReactNode }) {
  // One client per server render so cached data is never shared between requests.
  const [queryClient] = useState(() => new QueryClient());
  return (
    // The boot script may set attributes on <html> before React hydrates.
    <html lang="vi" suppressHydrationWarning>
      <head>
        {/* First in <head>: applies stored display hints before anything is painted. */}
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
