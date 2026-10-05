import { canonicalPageParam, canonicalPath, tagSlugSchema } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { createFileRoute } from '@tanstack/react-router';
import { NotFoundPage } from '../components/not-found';
import { SiteLayout } from '../components/site-layout';
import { Pagination } from '../components/story/pagination';
import { TAG_KIND_LABELS } from '../components/story/story-labels';
import { StoryGrid } from '../components/story/story-grid';
import { publicPageHeaders } from '../lib/cache-headers';
import { assertCanonical, requestLocation } from '../lib/canonical';
import { seo, siteConfig } from '../lib/seo';
import { throwNotFound } from '../lib/route-signals';
import { useMatureAwareList } from '../lib/use-mature-aware-list';
import { getTagPage } from '../server-fns/catalog';

export const Route = createFileRoute('/tags/$tagSlug')({
  // The page number is read from the raw request URL (`requestLocation`); this only makes the
  // router reload the data when it changes.
  loaderDeps: ({ search }) => ({ page: (search as { page?: unknown }).page }),
  loader: async ({ params, location }) => {
    const request = requestLocation(location);
    const slug = tagSlugSchema.safeParse(params.tagSlug.toLowerCase());
    if (!slug.success) throwNotFound();
    const query = new URLSearchParams(request.href.split('?')[1] ?? '');
    const page = canonicalPageParam(query.getAll('page'));
    const result = await getTagPage({ data: { slug: slug.data, page } });
    if (!result) throwNotFound();
    // A merged tag moved for good to its canonical tag (another path, so a cacheable 301), keeping
    // the page; otherwise a non-canonical page number, query or case is redirected.
    const canonicalSlug = result.kind === 'redirect' ? result.slug : result.tag.slug;
    assertCanonical(request, canonicalPath({ kind: 'tag', slug: canonicalSlug, page }));
    // Never reached for a redirect (a tag is never merged into itself); narrows the type.
    if (result.kind === 'redirect') throwNotFound();
    if (page > result.lastPage) throwNotFound();
    return result;
  },
  headers: ({ match }) => publicPageHeaders(match.status, { list: true }),
  head: ({ loaderData, matches }) => {
    if (!loaderData) return {};
    const { tag, stories } = loaderData;
    return seo({
      appUrl: siteConfig(matches)?.appUrl,
      path: canonicalPath({ kind: 'tag', slug: tag.slug, page: stories.page }),
      title:
        stories.page > 1
          ? m.tag_page_title_paged({ name: tag.name, page: String(stories.page) })
          : m.tag_page_title({ name: tag.name }),
      description: m.tag_page_description({ name: tag.name }),
      // A page only 18+ readers fill is empty in this HTML: nothing to index.
      noindex: stories.items.length === 0,
    });
  },
  notFoundComponent: NotFoundPage,
  component: TagPage,
});

function TagPage() {
  const { tag, stories } = Route.useLoaderData();
  const list = useMatureAwareList(
    { stories: stories.items, page: stories.page, totalPages: stories.totalPages },
    { list: 'tag', tag: tag.slug, page: String(stories.page) },
  );
  return (
    <SiteLayout>
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10">
        <header className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">{TAG_KIND_LABELS[tag.kind]()}</p>
          <h1 className="font-serif text-3xl font-semibold">{tag.name}</h1>
        </header>
        {list.stories.length > 0 ? (
          <StoryGrid stories={list.stories} priorityCount={6} />
        ) : (
          <p className="text-muted-foreground">{m.tag_page_empty()}</p>
        )}
        <Pagination
          page={list.page}
          // A page only 18+ readers fill is past the guest total.
          totalPages={Math.max(list.totalPages, list.page)}
          href={(page) => canonicalPath({ kind: 'tag', slug: tag.slug, page })}
        />
      </div>
    </SiteLayout>
  );
}
