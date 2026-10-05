import { createFileRoute } from '@tanstack/react-router';
import { sitemapListResponse } from '../../../server/seo-routes';

export const Route = createFileRoute('/sitemap/chapters/$page')({
  server: { handlers: { GET: ({ params }) => sitemapListResponse('chapters', params.page) } },
});
