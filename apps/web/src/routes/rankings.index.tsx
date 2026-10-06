import { canonicalPath } from '@novel-hub/shared';
import { createFileRoute } from '@tanstack/react-router';
import { assertCanonical, requestLocation } from '../lib/canonical';

/** `/rankings` has no page of its own: the weekly ranking is the default (cacheable 301). */
export const Route = createFileRoute('/rankings/')({
  loader: ({ location }) => {
    assertCanonical(requestLocation(location), canonicalPath({ kind: 'ranking', period: 'week' }));
  },
});
