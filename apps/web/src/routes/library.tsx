import { LIBRARY_TABS, type LibraryTab, type Shelf, libraryTabSchema } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { Link, createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { textLinkClass } from '../components/auth-ui';
import { HistoryList } from '../components/library/history-list';
import { LibraryItem } from '../components/library/library-item';
import { SHELF_LABELS } from '../components/library/shelf-labels';
import { SiteLayout } from '../components/site-layout';
import { Pagination } from '../components/story/pagination';
import { NO_STORE } from '../lib/cache-headers';
import { useLibraryShelf } from '../lib/library';
import { useMe } from '../lib/me';
import { cn } from '../lib/utils';

const librarySearchSchema = z.object({
  shelf: libraryTabSchema.catch('reading'),
  page: z.coerce.number().int().min(1).max(500).catch(1),
});

const TAB_LABELS: Record<LibraryTab, () => string> = { ...SHELF_LABELS, history: m.history_title };

/** `/library?shelf=…&page=…`; the first page is left out of the URL. */
function libraryHref(shelf: LibraryTab, page: number): string {
  return page > 1 ? `/library?shelf=${shelf}&page=${page}` : `/library?shelf=${shelf}`;
}

export const Route = createFileRoute('/library')({
  // A bad tab or page falls back instead of failing.
  validateSearch: (raw: Record<string, unknown>) => librarySearchSchema.parse(raw),
  // Everything here is personal and loaded in the browser; the page itself is never stored.
  headers: () => NO_STORE,
  head: () => ({
    meta: [{ title: m.library_title() }, { name: 'robots', content: 'noindex' }],
  }),
  component: LibraryPage,
});

function LibraryPage() {
  const { shelf, page } = Route.useSearch();
  const me = useMe();
  return (
    <SiteLayout>
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10">
        <h1 className="font-serif text-3xl font-semibold">{m.library_title()}</h1>
        {me.isPending ? (
          <p role="status" className="text-muted-foreground">
            {m.library_loading()}
          </p>
        ) : me.isError ? (
          <p role="alert">{m.error_generic()}</p>
        ) : !me.data ? (
          <GuestInvite />
        ) : (
          <>
            <LibraryTabs current={shelf} />
            {shelf === 'history' ? <HistoryList /> : <ShelfList shelf={shelf} page={page} />}
          </>
        )}
      </div>
    </SiteLayout>
  );
}

/** Shelves and history as tabs; switching is client-side (the page is personal, not cached). */
function LibraryTabs({ current }: { current: LibraryTab }) {
  return (
    <nav aria-label={m.library_tabs()} className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-1 border-b">
        {LIBRARY_TABS.map((tab) => (
          <li key={tab}>
            <Link
              to="/library"
              search={{ shelf: tab, page: 1 }}
              aria-current={tab === current ? 'page' : undefined}
              className={cn(
                '-mb-px inline-block border-b-2 px-3 py-2 text-sm whitespace-nowrap',
                tab === current
                  ? 'border-primary font-medium text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {TAB_LABELS[tab]()}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ShelfList({ shelf, page }: { shelf: Shelf; page: number }) {
  const list = useLibraryShelf(shelf, page, true);
  if (list.isPending) {
    return (
      <p role="status" className="text-muted-foreground">
        {m.library_loading()}
      </p>
    );
  }
  if (list.isError) {
    return (
      <p role="alert" className="text-muted-foreground">
        {m.error_generic()}
      </p>
    );
  }
  const { items, totalPages } = list.data;
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-muted-foreground">{m.library_empty()}</p>
        <a href="/" className={textLinkClass}>
          {m.library_browse()}
        </a>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-8">
      <ul className="flex flex-col gap-6">
        {items.map((item) => (
          <li key={item.story.publicId}>
            <LibraryItem story={item.story} shelf={item.shelf} progress={item.progress} />
          </li>
        ))}
      </ul>
      <Pagination
        page={list.data.page}
        totalPages={totalPages}
        href={(p) => libraryHref(shelf, p)}
      />
    </div>
  );
}

function GuestInvite() {
  return (
    <section className="flex flex-col gap-2">
      <p>{m.library_sign_in()}</p>
      <nav className="flex gap-4">
        <Link to="/sign-in" className={textLinkClass}>
          {m.home_sign_in()}
        </Link>
        <Link to="/sign-up" className={textLinkClass}>
          {m.home_sign_up()}
        </Link>
      </nav>
    </section>
  );
}
