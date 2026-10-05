import { canonicalPath, parseStoryKey } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { createFileRoute } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NotFoundPage } from '../components/not-found';
import { MatureGate, useMatureAllowed } from '../components/reader/mature-gate';
import { SiteLayout } from '../components/site-layout';
import { StoryChapterList } from '../components/story/story-chapter-list';
import { TAG_KIND_LABELS } from '../components/story/story-labels';
import { StoryMeta } from '../components/story/story-meta';
import { StoryCover } from '../components/story-cover';
import { publicPageHeaders } from '../lib/cache-headers';
import { assertCanonical, requestLocation } from '../lib/canonical';
import { throwNotFound } from '../lib/route-signals';
import { getStoryPage } from '../server-fns/catalog';
import { metaDescription } from '../lib/meta-description';

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
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const { story, appUrl } = loaderData;
    return {
      meta: [
        { title: m.story_page_title({ title: story.title, author: story.author.displayName }) },
        { name: 'description', content: metaDescription(story.synopsis) },
        ...(story.isMature ? [{ name: 'robots', content: 'noindex' }] : []),
      ],
      links: [
        {
          rel: 'canonical',
          href: new URL(canonicalPath({ kind: 'story', ...story }), appUrl).href,
        },
      ],
    };
  },
  notFoundComponent: NotFoundPage,
  component: StoryPage,
});

function StoryPage() {
  const { story, chapters, chaptersPerWeek } = Route.useLoaderData();
  const matureAllowed = useMatureAllowed();
  const gated = story.isMature && !matureAllowed;
  const first = chapters[0];
  const tagGroups = (['genre', 'theme', 'warning'] as const)
    .map((kind) => ({ kind, tags: story.tags.filter((t) => t.kind === kind) }))
    .filter((group) => group.tags.length > 0);

  return (
    <>
      {/* While the 18+ screen shows, everything behind it is out of reach. */}
      <div inert={gated}>
        <SiteLayout>
          <article className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-10">
            <header className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <StoryCover
                title={story.title}
                authorName={story.author.displayName}
                mainTagSlug={story.mainTag.slug}
                coverUrl={story.coverUrl}
                sizes="(min-width: 640px) 200px, 60vw"
                priority
                className="w-48 shrink-0 self-center sm:w-52 sm:self-start"
              />
              <div className="flex min-w-0 flex-col gap-4">
                {/* Focus target once the 18+ screen goes away. */}
                <h1
                  tabIndex={-1}
                  className="font-serif text-3xl leading-tight font-semibold text-balance outline-none"
                >
                  {story.title}
                </h1>
                <p>
                  <span className="text-muted-foreground">{m.story_page_by()} </span>
                  <a
                    href={canonicalPath({ kind: 'author', username: story.author.username })}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {story.author.displayName}
                  </a>
                </p>
                <div className="flex flex-wrap gap-2">
                  <TagLink slug={story.mainTag.slug} name={story.mainTag.name} />
                  {story.isAiAssisted ? <Badge variant="outline">{m.story_card_ai()}</Badge> : null}
                  {story.isMature ? <Badge variant="outline">{m.story_card_mature()}</Badge> : null}
                </div>
                <StoryMeta
                  status={story.status}
                  chapterCount={story.chapterCount}
                  wordCount={story.wordCount}
                  chaptersPerWeek={chaptersPerWeek}
                  lastChapterAt={story.lastChapterAt}
                />
                {first ? (
                  <Button asChild className="self-start">
                    <a href={canonicalPath({ kind: 'chapter', ...story, number: first.number })}>
                      {m.story_page_start()}
                    </a>
                  </Button>
                ) : null}
              </div>
            </header>

            {story.synopsis ? (
              <section aria-labelledby="synopsis-title" className="flex flex-col gap-3">
                <h2 id="synopsis-title" className="font-serif text-xl font-semibold">
                  {m.story_page_synopsis()}
                </h2>
                <p className="font-serif leading-relaxed whitespace-pre-line">{story.synopsis}</p>
              </section>
            ) : null}

            {tagGroups.length > 0 ? (
              <dl className="flex flex-col gap-3">
                {tagGroups.map((group) => (
                  <div key={group.kind} className="flex flex-wrap items-center gap-2">
                    <dt className="text-sm text-muted-foreground">
                      {TAG_KIND_LABELS[group.kind]()}
                    </dt>
                    {group.tags.map((tag) => (
                      <dd key={tag.slug}>
                        <TagLink slug={tag.slug} name={tag.name} />
                      </dd>
                    ))}
                  </div>
                ))}
              </dl>
            ) : null}

            <section aria-labelledby="toc-title" className="flex flex-col gap-3">
              <h2 id="toc-title" className="font-serif text-xl font-semibold">
                {m.story_page_toc()}
              </h2>
              <StoryChapterList story={story} chapters={chapters} />
            </section>
          </article>
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

function TagLink({ slug, name }: { slug: string; name: string }) {
  return (
    <Badge asChild variant="secondary">
      <a href={canonicalPath({ kind: 'tag', slug })}>{name}</a>
    </Badge>
  );
}
