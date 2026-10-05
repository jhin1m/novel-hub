import { createFileRoute } from '@tanstack/react-router';
import { sitemapIndexResponse } from '../server/seo-routes';

export const Route = createFileRoute('/sitemap.xml')({
  server: { handlers: { GET: () => sitemapIndexResponse() } },
});
