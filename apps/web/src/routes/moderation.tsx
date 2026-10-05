import {
  REPORT_REASONS,
  REPORT_STATUSES,
  type ReportListQuery,
  reportListQuerySchema,
} from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { Link, createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { textLinkClass } from '../components/auth-ui';
import { MergeTagForm } from '../components/moderation/merge-tag-form';
import { REPORT_STATUS_LABELS, ReportCard } from '../components/moderation/report-card';
import { REASON_LABELS } from '../components/report/reason-labels';
import { SiteLayout } from '../components/site-layout';
import { Pagination } from '../components/story/pagination';
import { ApiError } from '../lib/api-errors';
import { NO_STORE } from '../lib/cache-headers';
import { type MeUser, useMe } from '../lib/me';
import { useReports } from '../lib/moderation';
import { cn } from '../lib/utils';
import { seo } from '../lib/seo';

const MODERATION_TABS = ['reports', 'tags'] as const;

const moderationSearchSchema = reportListQuerySchema.extend({
  tab: z.enum(MODERATION_TABS).optional().catch(undefined),
});

type ModerationSearch = z.output<typeof moderationSearchSchema>;

/** `/moderation?…` with defaults left out of the URL. */
function moderationHref(search: ModerationSearch): string {
  const params = new URLSearchParams();
  if (search.tab === 'tags') params.set('tab', 'tags');
  if (search.status !== 'open') params.set('status', search.status);
  if (search.reason) params.set('reason', search.reason);
  if (search.page > 1) params.set('page', String(search.page));
  const query = params.toString();
  return query ? `/moderation?${query}` : '/moderation';
}

export const Route = createFileRoute('/moderation')({
  // Personal (role-gated) and fully client-side: nothing to render or cache on the server.
  ssr: false,
  validateSearch: (raw: Record<string, unknown>) => moderationSearchSchema.parse(raw),
  headers: () => NO_STORE,
  head: () => seo({ title: m.moderation_title(), noindex: true }),
  component: ModerationPage,
});

function ModerationPage() {
  const search = Route.useSearch();
  const me = useMe();
  const role = me.data?.role;
  const allowed = role === 'mod' || role === 'admin';

  return (
    <SiteLayout>
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10">
        <h1 className="font-serif text-3xl font-semibold">{m.moderation_title()}</h1>
        {me.isPending ? (
          <p role="status" className="text-muted-foreground">
            {m.moderation_loading()}
          </p>
        ) : me.isError ? (
          <p role="alert">{m.error_generic()}</p>
        ) : !me.data ? (
          <p>
            {m.moderation_sign_in()}{' '}
            <Link to="/sign-in" className={textLinkClass}>
              {m.home_sign_in()}
            </Link>
          </p>
        ) : !allowed ? (
          <p role="alert">{m.moderation_forbidden()}</p>
        ) : (
          <>
            <TabLinks
              label={m.moderation_tabs()}
              items={MODERATION_TABS.map((tab) => ({
                key: tab,
                label: tab === 'reports' ? m.moderation_tab_reports() : m.moderation_tab_tags(),
                search: { ...search, tab: tab === 'tags' ? tab : undefined, page: 1 },
                current: (search.tab ?? 'reports') === tab,
              }))}
            />
            {search.tab === 'tags' ? (
              <MergeTagForm />
            ) : (
              <ReportQueue search={search} viewer={me.data} />
            )}
          </>
        )}
      </div>
    </SiteLayout>
  );
}

interface TabItem {
  key: string;
  label: string;
  search: ModerationSearch;
  current: boolean;
}

/** A row of client-side links that rewrite the search params (the page is never cached). */
function TabLinks({ label, items, small }: { label: string; items: TabItem[]; small?: boolean }) {
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4">
      <ul className={cn('flex gap-1', small ? 'flex-wrap' : 'border-b')}>
        {items.map((item) => (
          <li key={item.key}>
            <Link
              to="/moderation"
              search={item.search}
              aria-current={item.current ? 'page' : undefined}
              className={cn(
                'inline-block text-sm whitespace-nowrap',
                small
                  ? cn(
                      'rounded-md border px-2 py-1',
                      item.current
                        ? 'border-primary text-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )
                  : cn(
                      '-mb-px border-b-2 px-3 py-2',
                      item.current
                        ? 'border-primary font-medium text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground',
                    ),
              )}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ReportQueue({ search, viewer }: { search: ModerationSearch; viewer: MeUser }) {
  const query: ReportListQuery = {
    status: search.status,
    reason: search.reason,
    page: search.page,
  };
  const list = useReports(query, true);

  return (
    <div className="flex flex-col gap-6">
      <TabLinks
        small
        label={m.moderation_status_filter()}
        items={REPORT_STATUSES.map((status) => ({
          key: status,
          label: REPORT_STATUS_LABELS[status](),
          search: { ...search, status, page: 1 },
          current: search.status === status,
        }))}
      />
      <TabLinks
        small
        label={m.moderation_reason_filter()}
        items={[undefined, ...REPORT_REASONS].map((reason) => ({
          key: reason ?? 'all',
          label: reason ? REASON_LABELS[reason]() : m.moderation_all_reasons(),
          search: { ...search, reason, page: 1 },
          current: search.reason === reason,
        }))}
      />
      {list.isPending ? (
        <p role="status" className="text-muted-foreground">
          {m.moderation_loading()}
        </p>
      ) : list.isError ? (
        <p role="alert">
          {list.error instanceof ApiError && list.error.status === 403
            ? m.moderation_forbidden()
            : m.error_generic()}
        </p>
      ) : list.data.items.length === 0 ? (
        <p className="text-muted-foreground">{m.moderation_empty()}</p>
      ) : (
        <>
          <ul className="flex flex-col gap-4">
            {list.data.items.map((report) => (
              <li key={report.reportId}>
                <ReportCard report={report} viewer={viewer} />
              </li>
            ))}
          </ul>
          <Pagination
            page={list.data.page}
            totalPages={list.data.totalPages}
            href={(page) => moderationHref({ ...search, page })}
          />
        </>
      )}
    </div>
  );
}
