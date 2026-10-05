import { createFileRoute } from '@tanstack/react-router';
import { sitemapListResponse } from '../../../server/seo-routes';

export const Route = createFileRoute('/sitemap/stories/$page')({
  server: { handlers: { GET: ({ params }) => sitemapListResponse('stories', params.page) } },
});
