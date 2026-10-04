import { createFileRoute } from '@tanstack/react-router';
import { handleApiRequest } from '../../server/api-app';

// Mọi method dưới `/api/*` (kể cả HEAD, OPTIONS) chuyển nguyên cho Hono.
export const Route = createFileRoute('/api/$')({
  server: {
    handlers: {
      ANY: ({ request }) => handleApiRequest(request),
    },
  },
});
