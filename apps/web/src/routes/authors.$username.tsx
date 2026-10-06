import { canonicalPath, usernameParamSchema } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { createFileRoute } from '@tanstack/react-router';
import { BookOpenIcon } from 'lucide-react';
import { NotFoundPage } from '../components/not-found';
import { PageShell, PageTitle } from '../components/page-shell';
import { ReportButton } from '../components/report/report-button';
import { SectionHeading } from '../components/section-heading';
import { SiteLayout } from '../components/site-layout';
import { StoryGrid } from '../components/story/story-grid';
import { publicPageHeaders } from '../lib/cache-headers';
import { assertCanonical, requestLocation } from '../lib/canonical';
import { formatInitial } from '../lib/format';
import { seo, siteConfig } from '../lib/seo';
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
  head: ({ loaderData, matches }) => {
    if (!loaderData) return {};
    const { author, stories } = loaderData;
    return seo({
      appUrl: siteConfig(matches)?.appUrl,
      path: canonicalPath({ kind: 'author', username: author.username }),
      title: author.displayName,
      description: author.bio?.trim()
        ? author.bio
        : m.author_page_description({ name: author.displayName }),
      type: 'profile',
      // Only 18+ stories: the server-rendered list is empty, nothing to index.
      noindex: stories.length === 0,
    });
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
      <PageShell className="gap-10">
        <header className="flex max-w-[720px] items-start gap-4">
          <span
            aria-hidden="true"
            className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary-soft text-2xl font-extrabold text-primary"
          >
            {formatInitial(author.displayName)}
          </span>
          <div className="flex min-w-0 flex-col gap-2">
            <div>
              <PageTitle>{author.displayName}</PageTitle>
              <p className="text-sm text-muted-foreground">@{author.username}</p>
            </div>
            {author.bio ? (
              <p className="leading-relaxed whitespace-pre-line text-muted-foreground">
                {author.bio}
              </p>
            ) : null}
            <ReportButton
              target={{ type: 'user', username: author.username }}
              className="self-start"
            />
          </div>
        </header>
        <section aria-labelledby="author-stories" className="flex flex-col gap-5">
          <SectionHeading id="author-stories" icon={BookOpenIcon} title={m.author_page_stories()} />
          {list.stories.length > 0 ? (
            <StoryGrid stories={list.stories} priorityCount={6} />
          ) : (
            <p className="text-muted-foreground">{m.author_page_empty()}</p>
          )}
        </section>
      </PageShell>
    </SiteLayout>
  );
}
