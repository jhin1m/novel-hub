import { canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { createFileRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { SiteLayout } from '../components/site-layout';
import { StoryGrid } from '../components/story/story-grid';
import { publicPageHeaders } from '../lib/cache-headers';
import { assertCanonical, requestLocation } from '../lib/canonical';
import { seo, siteConfig } from '../lib/seo';
import { useMatureAwareList } from '../lib/use-mature-aware-list';
import { getHomePage } from '../server-fns/catalog';

export const Route = createFileRoute('/')({
  // Never reads the session: the account lives in the header and on `/settings`, loaded in the
  // browser, so this HTML is the same for everyone and cached by the CDN.
  loader: async ({ location }) => {
    assertCanonical(requestLocation(location), canonicalPath({ kind: 'home' }));
    return getHomePage();
  },
  headers: ({ match }) => publicPageHeaders(match.status, { list: true }),
  head: ({ matches }) =>
    seo({
      appUrl: siteConfig(matches)?.appUrl,
      path: canonicalPath({ kind: 'home' }),
      description: m.home_description(),
    }),
  component: HomePage,
});

function HomePage() {
  const { recent, notable, genres } = Route.useLoaderData();
  const recentList = useMatureAwareList(
    { stories: recent, page: 1, totalPages: 1 },
    { list: 'recent' },
  );
  const notableList = useMatureAwareList(
    { stories: notable, page: 1, totalPages: 1 },
    { list: 'notable' },
  );
  return (
    <SiteLayout>
      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-10">
        <h1 className="sr-only">{m.app_name()}</h1>
        <HomeSection id="recent" title={m.home_recent()}>
          {recentList.stories.length > 0 ? (
            <StoryGrid stories={recentList.stories} priorityCount={6} />
          ) : (
            <p className="text-muted-foreground">{m.home_empty()}</p>
          )}
        </HomeSection>
        {notableList.stories.length > 0 ? (
          <HomeSection id="notable" title={m.home_notable()}>
            <StoryGrid stories={notableList.stories} />
          </HomeSection>
        ) : null}
        {genres.length > 0 ? (
          <HomeSection id="genres" title={m.home_genres()}>
            <ul className="flex flex-wrap gap-2">
              {genres.map((tag) => (
                <li key={tag.slug}>
                  <Badge asChild variant="secondary" className="px-3 py-1 text-sm">
                    <a href={canonicalPath({ kind: 'tag', slug: tag.slug })}>{tag.name}</a>
                  </Badge>
                </li>
              ))}
            </ul>
          </HomeSection>
        ) : null}
      </div>
    </SiteLayout>
  );
}

function HomeSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-4">
      <h2 id={`${id}-title`} className="font-serif text-2xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}
