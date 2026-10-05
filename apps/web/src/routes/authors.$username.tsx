import { canonicalPath, usernameParamSchema } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { createFileRoute } from '@tanstack/react-router';
import { NotFoundPage } from '../components/not-found';
import { ReportButton } from '../components/report/report-button';
import { SiteLayout } from '../components/site-layout';
import { StoryGrid } from '../components/story/story-grid';
import { publicPageHeaders } from '../lib/cache-headers';
import { assertCanonical, requestLocation } from '../lib/canonical';
import { metaDescription } from '../lib/meta-description';
import { throwNotFound } from '../lib/route-signals';
import { useMatureAwareList } from '../lib/use-mature-aware-list';
import { getAuthorPage } from '../server-fns/catalog';

export const Route = createFileRoute('/authors/$username')({
  loader: async ({ params, location }) => {
    const username = usernameParamSchema.safeParse(params.username.toLowerCase());
    if (!username.success) throwNotFound();
    const page = await getAuthorPage({ data: { username: username.data } });
    if (!page) throwNotFound();
    assertCanonical(
      requestLocation(location),
      canonicalPath({ kind: 'author', username: page.author.username }),
    );
    return page;
  },
  headers: ({ match }) => publicPageHeaders(match.status, { list: true }),
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const { author, appUrl } = loaderData;
    const path = canonicalPath({ kind: 'author', username: author.username });
    return {
      meta: [
        { title: author.displayName },
        { name: 'description', content: metaDescription(author.bio ?? '') },
      ],
      links: [{ rel: 'canonical', href: new URL(path, appUrl).href }],
    };
  },
  notFoundComponent: NotFoundPage,
  component: AuthorPage,
});

function AuthorPage() {
  const { author, stories } = Route.useLoaderData();
  const list = useMatureAwareList(
    { stories, page: 1, totalPages: 1 },
    { list: 'author', author: author.username },
  );
  return (
    <SiteLayout>
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10">
        <header className="flex max-w-2xl flex-col gap-3">
          <h1 className="font-serif text-3xl font-semibold">{author.displayName}</h1>
          {author.bio ? (
            <p className="leading-relaxed whitespace-pre-line text-muted-foreground">
              {author.bio}
            </p>
          ) : null}
          <ReportButton
            target={{ type: 'user', username: author.username }}
            className="self-start"
          />
        </header>
        <section aria-labelledby="author-stories" className="flex flex-col gap-4">
          <h2 id="author-stories" className="font-serif text-xl font-semibold">
            {m.author_page_stories()}
          </h2>
          {list.stories.length > 0 ? (
            <StoryGrid stories={list.stories} priorityCount={6} />
          ) : (
            <p className="text-muted-foreground">{m.author_page_empty()}</p>
          )}
        </section>
      </div>
    </SiteLayout>
  );
}
