import { canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { createFileRoute } from '@tanstack/react-router';
import { StaticPage } from '../components/static-page';
import { publicPageHeaders } from '../lib/cache-headers';
import { assertCanonical, requestLocation } from '../lib/canonical';

export const Route = createFileRoute('/terms')({
  loader: ({ location }) => {
    assertCanonical(requestLocation(location), canonicalPath({ kind: 'static', path: '/terms' }));
  },
  headers: ({ match }) => publicPageHeaders(match.status),
  head: () => ({ meta: [{ title: m.terms_title() }] }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <StaticPage
      title={m.terms_title()}
      sections={[
        { paragraphs: [m.terms_intro()] },
        { heading: m.terms_account_heading(), paragraphs: [m.terms_account_body()] },
        {
          heading: m.terms_copyright_heading(),
          paragraphs: [m.terms_copyright_body(), m.terms_original_body()],
        },
        { heading: m.terms_free_heading(), paragraphs: [m.terms_free_body()] },
        { heading: m.terms_ai_heading(), paragraphs: [m.terms_ai_body()] },
        { heading: m.terms_moderation_heading(), paragraphs: [m.terms_moderation_body()] },
        { heading: m.terms_changes_heading(), paragraphs: [m.terms_changes_body()] },
      ]}
    />
  );
}
