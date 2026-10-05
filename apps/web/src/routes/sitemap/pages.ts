import { createFileRoute } from '@tanstack/react-router';
import { sitemapPagesResponse } from '../../server/seo-routes';

export const Route = createFileRoute('/sitemap/pages')({
  server: { handlers: { GET: () => sitemapPagesResponse() } },
});
