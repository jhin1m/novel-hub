import { canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { createFileRoute } from '@tanstack/react-router';
import { ClockIcon, SparklesIcon } from 'lucide-react';
import { HomeContinueReading } from '../components/home/home-continue-reading';
import { HomeFeaturedHero } from '../components/home/home-featured-hero';
import { HomeGenreChips } from '../components/home/home-genre-chips';
import { SectionHeading } from '../components/section-heading';
import { SiteLayout } from '../components/site-layout';
import { StoryGrid } from '../components/story/story-grid';
import { StoryRowList } from '../components/story/story-row-list';
import { publicPageHeaders } from '../lib/cache-headers';
import { assertCanonical, requestLocation } from '../lib/canonical';
import { pickHero, withoutStory } from '../lib/home';
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
  // From the server-rendered list, so the hero is the same in the HTML and after hydration and
  // is never an 18+ story; the band below leaves it out, whichever list it shows.
  const hero = pickHero(notable);
  const notableStories = withoutStory(notableList.stories, hero?.publicId ?? null);
  return (
    <SiteLayout>
      <h1 className="sr-only">{m.app_name()}</h1>
      <div className="flex flex-col gap-[52px] py-8 md:py-10">
        <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-[52px] px-4 md:px-8">
          {genres.length > 0 ? <HomeGenreChips genres={genres} /> : null}
          <div className="flex flex-wrap gap-6 empty:hidden">
            {hero ? <HomeFeaturedHero story={hero} /> : null}
            <HomeContinueReading />
          </div>
          <section aria-labelledby="recent-title" className="flex flex-col gap-5">
            <SectionHeading
              id="recent-title"
              icon={ClockIcon}
              title={m.home_recent()}
              subtitle={m.home_recent_subtitle()}
            />
            {recentList.stories.length > 0 ? (
              <StoryRowList stories={recentList.stories} priorityCount={4} />
            ) : (
              <p className="text-muted-foreground">{m.home_empty()}</p>
            )}
          </section>
        </div>
        {notableStories.length > 0 ? (
          <section aria-labelledby="notable-title" className="bg-band py-11">
            <div className="mx-auto flex max-w-[1240px] flex-col gap-5 px-4 md:px-8">
              <SectionHeading
                id="notable-title"
                icon={SparklesIcon}
                title={m.home_notable()}
                subtitle={m.home_notable_subtitle()}
                onBand
              />
              <StoryGrid stories={notableStories} scroll />
            </div>
          </section>
        ) : null}
      </div>
    </SiteLayout>
  );
}
