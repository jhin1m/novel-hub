import { canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { createFileRoute } from '@tanstack/react-router';
import { StaticPage } from '../components/static-page';
import { publicPageHeaders } from '../lib/cache-headers';
import { assertCanonical, requestLocation } from '../lib/canonical';
import { seo, siteConfig } from '../lib/seo';

export const Route = createFileRoute('/privacy')({
  loader: ({ location }) => {
    assertCanonical(requestLocation(location), canonicalPath({ kind: 'static', path: '/privacy' }));
  },
  headers: ({ match }) => publicPageHeaders(match.status),
  head: ({ matches }) =>
    seo({
      appUrl: siteConfig(matches)?.appUrl,
      path: canonicalPath({ kind: 'static', path: '/privacy' }),
      title: m.privacy_title(),
      description: m.privacy_intro(),
    }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <StaticPage
      title={m.privacy_title()}
      sections={[
        { paragraphs: [m.privacy_intro()] },
        {
          heading: m.privacy_data_heading(),
          paragraphs: [
            m.privacy_data_account_body(),
            m.privacy_data_activity_body(),
            m.privacy_data_technical_body(),
          ],
        },
        { heading: m.privacy_purpose_heading(), paragraphs: [m.privacy_purpose_body()] },
        { heading: m.privacy_processors_heading(), paragraphs: [m.privacy_processors_body()] },
        { heading: m.privacy_retention_heading(), paragraphs: [m.privacy_retention_body()] },
        { heading: m.privacy_cookies_heading(), paragraphs: [m.privacy_cookies_body()] },
        { heading: m.privacy_rights_heading(), paragraphs: [m.privacy_rights_body()] },
        { heading: m.privacy_minors_heading(), paragraphs: [m.privacy_minors_body()] },
        { heading: m.privacy_contact_heading(), paragraphs: [m.privacy_contact_body()] },
        { heading: m.privacy_changes_heading(), paragraphs: [m.privacy_changes_body()] },
      ]}
    />
  );
}
