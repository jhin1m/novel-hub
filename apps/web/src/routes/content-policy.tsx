import { canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { createFileRoute } from '@tanstack/react-router';
import { StaticPage } from '../components/static-page';
import { publicPageHeaders } from '../lib/cache-headers';
import { assertCanonical, requestLocation } from '../lib/canonical';

export const Route = createFileRoute('/content-policy')({
  loader: ({ location }) => {
    assertCanonical(
      requestLocation(location),
      canonicalPath({ kind: 'static', path: '/content-policy' }),
    );
  },
  headers: ({ match }) => publicPageHeaders(match.status),
  head: () => ({ meta: [{ title: m.rules_title() }] }),
  component: ContentPolicyPage,
});

function ContentPolicyPage() {
  return (
    <StaticPage
      title={m.rules_title()}
      sections={[
        { paragraphs: [m.rules_intro()] },
        { heading: m.rules_forbidden_heading(), paragraphs: [m.rules_forbidden_body()] },
        { heading: m.rules_copyright_heading(), paragraphs: [m.rules_copyright_body()] },
        { heading: m.rules_mature_heading(), paragraphs: [m.rules_mature_body()] },
        { heading: m.rules_tags_heading(), paragraphs: [m.rules_tags_body()] },
        { heading: m.rules_report_heading(), paragraphs: [m.rules_report_body()] },
      ]}
    />
  );
}
