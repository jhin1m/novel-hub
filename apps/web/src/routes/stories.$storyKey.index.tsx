import { canonicalPath, parseStoryKey } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { createFileRoute } from '@tanstack/react-router';
import { StoryAnnouncement } from '../components/announcements/story-announcement';
import { StoryDiscussion } from '../components/comments/story-discussion';
import { TopReaders } from '../components/nominations/top-readers';
import { ReportButton } from '../components/report/report-button';
import { NotFoundPage } from '../components/not-found';
import { MatureGate, useMatureAllowed } from '../components/reader/mature-gate';
import { StoryRatings } from '../components/ratings/story-ratings';
import { SectionHeading } from '../components/section-heading';
import { SiteLayout } from '../components/site-layout';
import { StoryAuthorCard } from '../components/story/story-author-card';
import { StoryChapterList } from '../components/story/story-chapter-list';
import { StoryHero } from '../components/story/story-hero';
import { RelatedStories } from '../components/story/related-stories';
import { TAG_KIND_LABELS } from '../components/story/story-labels';
import { StoryStickyCta } from '../components/story/story-sticky-cta';
import { StorySynopsis } from '../components/story/story-synopsis';
import { TagChip } from '../components/tag-chip';
import { useContinueReading } from '../lib/library';
import { useMe } from '../lib/me';
import { publicPageHeaders } from '../lib/cache-headers';
import { assertCanonical, requestLocation } from '../lib/canonical';
import { throwNotFound } from '../lib/route-signals';
import { getStoryPage } from '../server-fns/catalog';
import { seo, siteConfig } from '../lib/seo';

export const Route = createFileRoute('/stories/$storyKey/')({
  // Never reads the session: the HTML is the same for every visitor and cached by the CDN.
  loader: async ({ params, location }) => {
    const key = parseStoryKey(params.storyKey.toLowerCase());
    if (!key) throwNotFound();
    const page = await getStoryPage({ data: { publicId: key.publicId } });
    if (!page) throwNotFound();
    const { slug, publicId } = page.story;
    assertCanonical(requestLocation(location), canonicalPath({ kind: 'story', slug, publicId }));
    return page;
  },
  headers: ({ match, loaderData }) =>
    publicPageHeaders(match.status, { noindex: loaderData?.story.isMature }),
  head: ({ loaderData, matches }) => {
    if (!loaderData) return {};
    const { story } = loaderData;
    return seo({
      appUrl: siteConfig(matches)?.appUrl,
      path: canonicalPath({ kind: 'story', ...story }),
      title: m.story_page_title({ title: story.title, author: story.author.displayName }),
      description: story.synopsis,
      image: story.coverUrl,
      type: 'book',
      mature: story.isMature,
    });
  },
  notFoundComponent: NotFoundPage,
  component: StoryPage,
});

function StoryPage() {
  const { story, chapters, chaptersPerWeek, announcement } = Route.useLoaderData();
  const matureAllowed = useMatureAllowed();
  const gated = story.isMature && !matureAllowed;
  const first = chapters[0];
  // Same query as the reading buttons, so no extra request; the server always renders `null`.
  const me = useMe();
  const currentNumber = useContinueReading(story.publicId, !!me.data).data?.chapterNumber ?? null;
  const tagGroups = (['genre', 'theme', 'warning'] as const)
    .map((kind) => ({ kind, tags: story.tags.filter((t) => t.kind === kind) }))
    .filter((group) => group.tags.length > 0);

  return (
    <>
      {/* While the 18+ screen shows, everything behind it is out of reach. */}
      <div inert={gated}>
        <SiteLayout bottomInset="cta">
          <StoryHero
            story={story}
            chaptersPerWeek={chaptersPerWeek}
            firstChapterNumber={first?.number ?? null}
          />
          {/* Above the hero, whose `isolate` makes it a stacking context of its own. */}
          <div className="relative z-10 mx-auto -mt-7 flex max-w-[1240px] flex-wrap items-start gap-6 rounded-t-[28px] bg-background pt-4 px-safe-4 pb-12 md:-mt-16 md:rounded-none md:bg-transparent md:pt-0 md:px-safe-8 md:pb-[72px]">
            <article className="flex min-w-0 flex-[999_1_560px] flex-col gap-8 rounded-[18px] border border-border bg-card p-5 md:gap-[38px] md:rounded-[28px] md:p-[clamp(22px,3.4vw,40px)]">
              {story.synopsis ? (
                <section aria-labelledby="synopsis-title" className="flex flex-col gap-2.5">
                  <SectionHeading id="synopsis-title" title={m.story_page_synopsis()} />
                  <StorySynopsis text={story.synopsis} />
                </section>
              ) : null}

              {announcement ? (
                <StoryAnnouncement announcement={announcement}>
                  <ReportButton
                    target={{ type: 'announcement', announcementId: announcement.id }}
                  />
                </StoryAnnouncement>
              ) : null}

              {tagGroups.length > 0 ? (
                <dl className="flex flex-col gap-3">
                  {tagGroups.map((group) => (
                    <div key={group.kind} className="flex flex-wrap items-center gap-2">
                      <dt className="mr-1 text-sm text-muted-foreground">
                        {TAG_KIND_LABELS[group.kind]()}
                      </dt>
                      {group.tags.map((tag) => (
                        <dd key={tag.slug}>
                          <TagChip slug={tag.slug} name={tag.name} kind={group.kind} />
                        </dd>
                      ))}
                    </div>
                  ))}
                </dl>
              ) : null}

              <section aria-labelledby="toc-title" className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between gap-3">
                  <SectionHeading id="toc-title" title={m.story_page_toc()} />
                  {chapters.length > 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {m.story_page_toc_count({ count: String(chapters.length) })}
                    </p>
                  ) : null}
                </div>
                <StoryChapterList story={story} chapters={chapters} currentNumber={currentNumber} />
              </section>

              {/* Only a story with a chapter to have read can be rated. */}
              {first ? (
                <StoryRatings
                  publicId={story.publicId}
                  authorUsername={story.author.username}
                  enabled={!gated}
                />
              ) : null}

              {/* Like ratings and chapter comments, a discussion needs something to have read. */}
              {first ? <StoryDiscussion publicId={story.publicId} enabled={!gated} /> : null}
            </article>
            <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-6">
              <StoryAuthorCard author={story.author} />
              <RelatedStories publicId={story.publicId} enabled={!gated} />
              <TopReaders publicId={story.publicId} isMature={story.isMature} />
              <ReportButton
                target={{ type: 'story', storyPublicId: story.publicId }}
                className="self-start"
              />
            </aside>
          </div>
          {first ? <StoryStickyCta story={story} firstChapterNumber={first.number} /> : null}
        </SiteLayout>
      </div>
      {story.isMature ? (
        <MatureGate
          storyTitle={story.title}
          warningTags={story.tags.filter((t) => t.kind === 'warning')}
        />
      ) : null}
    </>
  );
}
