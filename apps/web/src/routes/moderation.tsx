import {
  CONTESTS_ENABLED,
  REPORT_REASONS,
  REPORT_STATUSES,
  type ReportListQuery,
  isValidPublicId,
  reportListQuerySchema,
} from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { textLinkClass } from '../components/auth-ui';
import { ContestAdminList } from '../components/moderation/contest-admin-list';
import { ContestForm } from '../components/moderation/contest-form';
import { FeatureSuggestions } from '../components/moderation/feature-suggestions';
import { FeaturedSlotForm } from '../components/moderation/featured-slot-form';
import { FeaturedSlotList } from '../components/moderation/featured-slot-list';
import { MergeTagForm } from '../components/moderation/merge-tag-form';
import { TabLinks } from '../components/moderation/moderation-tab-links';
import { REPORT_STATUS_LABELS, ReportCard } from '../components/moderation/report-card';
import { REASON_LABELS } from '../components/report/reason-labels';
import { PageShell, PageTitle } from '../components/page-shell';
import { SignInPromptLink } from '../components/sign-in-prompt-link';
import { SiteLayout } from '../components/site-layout';
import { Pagination } from '../components/story/pagination';
import { ApiError } from '../lib/api-errors';
import { NO_STORE } from '../lib/cache-headers';
import { type MeUser, useMe } from '../lib/me';
import { useReports } from '../lib/moderation';
import { seo } from '../lib/seo';

const MODERATION_TABS = ['reports', 'tags', 'featured', 'contests'] as const;

const TAB_LABELS: Record<(typeof MODERATION_TABS)[number], () => string> = {
  reports: m.moderation_tab_reports,
  tags: m.moderation_tab_tags,
  featured: m.moderation_tab_featured,
  contests: m.moderation_tab_contests,
};

const moderationSearchSchema = reportListQuerySchema.extend({
  tab: z
    .enum(MODERATION_TABS)
    .optional()
    .catch(undefined)
    .transform((tab) => (tab === 'contests' && !CONTESTS_ENABLED ? undefined : tab))
    .optional(),
  /** Featured tab: the story a suggestion put in the form, by public id. */
  story: z.string().refine(isValidPublicId).optional().catch(undefined),
});

export type ModerationSearch = z.output<typeof moderationSearchSchema>;

/** `/moderation?…` with defaults left out of the URL. */
function moderationHref(search: ModerationSearch): string {
  const params = new URLSearchParams();
  if (search.tab) params.set('tab', search.tab);
  if (search.status !== 'open') params.set('status', search.status);
  if (search.reason) params.set('reason', search.reason);
  if (search.page > 1) params.set('page', String(search.page));
  if (search.story) params.set('story', search.story);
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
  const navigate = useNavigate();
  const me = useMe();
  const role = me.data?.role;
  const allowed = role === 'mod' || role === 'admin';

  return (
    <SiteLayout>
      {/* A working queue reads better as one narrower column than across the full site grid. */}
      <PageShell className="max-w-[960px]">
        <PageTitle>{m.moderation_title()}</PageTitle>
        {me.isPending ? (
          <p role="status" className="text-muted-foreground">
            {m.moderation_loading()}
          </p>
        ) : me.isError ? (
          <p role="alert">{m.error_generic()}</p>
        ) : !me.data ? (
          <p>
            {m.moderation_sign_in()}{' '}
            <SignInPromptLink className={textLinkClass}>{m.home_sign_in()}</SignInPromptLink>
          </p>
        ) : !allowed ? (
          <p role="alert">{m.moderation_forbidden()}</p>
        ) : (
          <>
            <TabLinks
              label={m.moderation_tabs()}
              items={MODERATION_TABS.filter((tab) => CONTESTS_ENABLED || tab !== 'contests').map(
                (tab) => ({
                  key: tab,
                  label: TAB_LABELS[tab](),
                  search: {
                    ...search,
                    tab: tab === 'reports' ? undefined : tab,
                    page: 1,
                    story: undefined,
                  },
                  current: (search.tab ?? 'reports') === tab,
                }),
              )}
            />
            {search.tab === 'tags' ? (
              <MergeTagForm />
            ) : search.tab === 'featured' ? (
              <div className="flex flex-col gap-8">
                <FeatureSuggestions />
                <FeaturedSlotForm
                  initialStory={search.story}
                  onCreated={() =>
                    void navigate({ to: '/moderation', search: { ...search, story: undefined } })
                  }
                />
                <FeaturedSlotList />
              </div>
            ) : search.tab === 'contests' ? (
              <div className="flex flex-col gap-8">
                <p className="text-muted-foreground">{m.contest_admin_intro()}</p>
                <ContestForm />
                <ContestAdminList />
              </div>
            ) : (
              <ReportQueue search={search} viewer={me.data} />
            )}
          </>
        )}
      </PageShell>
    </SiteLayout>
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
                <ReportCard report={report} viewer={viewer} warnings={list.data.warnings} />
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
