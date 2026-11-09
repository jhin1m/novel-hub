import {
  CONTESTS_ENABLED,
  FEATURED_RULES,
  HOME_COMPLETED_LIMIT,
  NEW_STORY_SPOTLIGHT,
  NOTABLE_LIMIT,
  canonicalPath,
} from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { createFileRoute } from '@tanstack/react-router';
import { SparklesIcon } from 'lucide-react';
import { HomeContinueReading } from '../components/home/home-continue-reading';
import { HomeFeaturedHero } from '../components/home/home-featured-hero';
import { HomeFeaturedPicks } from '../components/home/home-featured-picks';
import { HomeGenreChips } from '../components/home/home-genre-chips';
import { HomeNewSpotlight } from '../components/home/home-new-spotlight';
import { HomeRankings } from '../components/home/home-rankings';
import { HomeRecentlyCompleted } from '../components/home/home-recently-completed';
import { HomeRecentUpdates } from '../components/home/home-recent-updates';
import { HomeWriteBand } from '../components/home/home-write-band';
import { SectionHeading } from '../components/section-heading';
import { SiteLayout } from '../components/site-layout';
import { StoryGrid } from '../components/story/story-grid';
import { publicPageHeaders } from '../lib/cache-headers';
import { assertCanonical, requestLocation } from '../lib/canonical';
import { pickDefaultPeriod } from '../lib/home-rankings';
import { claimSections } from '../lib/home-sections';
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
  // Rankings unreadable (Redis down): the section is left out and the page cached a minute only.
  headers: ({ match, loaderData }) =>
    publicPageHeaders(match.status, {
      list: true,
      degraded: loaderData?.rankings.available === false,
    }),
  head: ({ matches }) =>
    seo({
      appUrl: siteConfig(matches)?.appUrl,
      path: canonicalPath({ kind: 'home' }),
      description: m.home_description(),
    }),
  component: HomePage,
});

function HomePage() {
  const { hero, recent, notable, picks, genres, spotlight, completed, contests, rankings } =
    Route.useLoaderData();
  const recentList = useMatureAwareList(
    { stories: recent, page: 1, totalPages: 1 },
    { list: 'recent' },
  );
  const completedList = useMatureAwareList(
    { stories: completed, page: 1, totalPages: 1 },
    { list: 'completed' },
  );
  const notableList = useMatureAwareList(
    { stories: notable, page: 1, totalPages: 1 },
    { list: 'notable' },
  );
  // One story, one section, in this order ("recently updated" is a timeline and may repeat). The
  // rankings stay true to their order and only keep the stories of the period shown first out of
  // the sections after them. The completed and notable lists may swap in their 18+ variant once
  // hydrated, so they claim their server-rendered list too: a section after them would keep what
  // the HTML showed.
  const [
    ,
    pickedStories = [],
    ,
    completedStories = [],
    spotlightStories = [],
    notableStories = [],
  ] = claimSections([
    { stories: hero ? [hero] : [], limit: 1, filtered: true },
    // Never 18+ (refused when picked, filtered when read), so no client top-up as for the lists.
    { stories: picks, limit: FEATURED_RULES.homeLimit, filtered: true },
    {
      stories: rankings.available ? rankings.periods[pickDefaultPeriod(rankings.periods)] : [],
      limit: Number.POSITIVE_INFINITY,
      filtered: false,
    },
    {
      stories: completedList.stories,
      limit: HOME_COMPLETED_LIMIT,
      filtered: true,
      alsoClaim: completed,
    },
    { stories: spotlight, limit: NEW_STORY_SPOTLIGHT.size, filtered: true },
    { stories: notableList.stories, limit: NOTABLE_LIMIT, filtered: true, alsoClaim: notable },
  ]);
  return (
    <SiteLayout>
      <h1 className="sr-only">{m.app_name()}</h1>
      {/* From the loader, not a client list: the same in the HTML and after hydration, never 18+. */}
      {hero ? <HomeFeaturedHero story={hero} /> : null}
      <div className="mx-auto w-full max-w-[1240px] px-safe-4 md:px-safe-8">
        <HomeContinueReading overlapHero={hero?.coverUrl != null} />
      </div>
      <div className="flex flex-col gap-[52px] py-8 md:py-10">
        <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-[52px] px-safe-4 md:px-safe-8">
          {genres.length > 0 ? <HomeGenreChips genres={genres} /> : null}
          {pickedStories.length > 0 ? <HomeFeaturedPicks stories={pickedStories} /> : null}
          <HomeRankings rankings={rankings} />
          <HomeRecentUpdates stories={recentList.stories} />
          <HomeRecentlyCompleted stories={completedStories} />
          <HomeNewSpotlight stories={spotlightStories} />
        </div>
        {notableStories.length > 0 ? (
          <section aria-labelledby="notable-title" className="bg-band py-11">
            <div className="mx-auto flex max-w-[1240px] flex-col gap-5 px-safe-4 md:px-safe-8">
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
        <HomeWriteBand contests={CONTESTS_ENABLED ? contests : []} />
      </div>
    </SiteLayout>
  );
}
