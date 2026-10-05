import { canonicalPath, parseStoryKey } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { createFileRoute } from '@tanstack/react-router';
import { ReportButton } from '../components/report/report-button';
import { NotFoundPage } from '../components/not-found';
import { MatureGate, useMatureAllowed } from '../components/reader/mature-gate';
import { SiteLayout } from '../components/site-layout';
import { StoryAuthorCard } from '../components/story/story-author-card';
import { StoryChapterList } from '../components/story/story-chapter-list';
import { StoryHero } from '../components/story/story-hero';
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
  const { story, chapters, chaptersPerWeek } = Route.useLoaderData();
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
          <div className="relative mx-auto -mt-7 flex max-w-[1240px] flex-wrap items-start gap-6 rounded-t-[28px] bg-background px-4 pt-4 pb-12 md:-mt-14 md:rounded-none md:bg-transparent md:px-8">
            <article className="flex min-w-0 flex-[999_1_560px] flex-col gap-8 rounded-[18px] border border-border bg-card p-5 md:rounded-[28px] md:p-8">
              {story.synopsis ? (
                <section aria-labelledby="synopsis-title" className="flex flex-col gap-3">
                  <h2 id="synopsis-title" className="text-xl font-extrabold tracking-tight">
                    {m.story_page_synopsis()}
                  </h2>
                  <StorySynopsis text={story.synopsis} />
                </section>
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
                          <TagChip slug={tag.slug} name={tag.name} />
                        </dd>
                      ))}
                    </div>
                  ))}
                </dl>
              ) : null}

              <section aria-labelledby="toc-title" className="flex flex-col gap-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 id="toc-title" className="text-xl font-extrabold tracking-tight">
                    {m.story_page_toc()}
                  </h2>
                  {chapters.length > 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {m.story_page_toc_count({ count: String(chapters.length) })}
                    </p>
                  ) : null}
                </div>
                <StoryChapterList story={story} chapters={chapters} currentNumber={currentNumber} />
              </section>
            </article>
            <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-3">
              <StoryAuthorCard author={story.author} />
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
