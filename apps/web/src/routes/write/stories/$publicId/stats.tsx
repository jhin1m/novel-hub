import { m } from '@novel-hub/shared/messages';
import { Link, createFileRoute } from '@tanstack/react-router';
import { FormMessage, textLinkClass } from '../../../../components/auth-ui';
import { PageShell, PageTitle } from '../../../../components/page-shell';
import { SiteLayout } from '../../../../components/site-layout';
import { ChapterStatsSection } from '../../../../components/stats/chapter-stats-section';
import { StatsTotals } from '../../../../components/stats/stats-totals';
import { WriterGate } from '../../../../components/writer-gate';
import { ApiError } from '../../../../lib/api-errors';
import { useStoryStats } from '../../../../lib/author-stats';
import { NO_STORE } from '../../../../lib/cache-headers';
import { formatDate } from '../../../../lib/format';
import { seo } from '../../../../lib/seo';

export const Route = createFileRoute('/write/stories/$publicId/stats')({
  // The author's own numbers, loaded in the browser; the page itself is never stored.
  headers: () => NO_STORE,
  head: () => seo({ title: m.dashboard_title(), noindex: true }),
  component: StoryStatsPage,
});

function StoryStatsPage() {
  const { publicId } = Route.useParams();
  return (
    <SiteLayout>
      <PageShell>
        <Link to="/write/stories/$publicId" params={{ publicId }} className={textLinkClass}>
          {m.dashboard_back()}
        </Link>
        <PageTitle>{m.dashboard_title()}</PageTitle>
        <WriterGate>
          <StoryStats publicId={publicId} />
        </WriterGate>
      </PageShell>
    </SiteLayout>
  );
}

function StoryStats({ publicId }: { publicId: string }) {
  const stats = useStoryStats(publicId);

  if (stats.isPending) return <p className="text-muted-foreground">{m.writer_loading()}</p>;
  if (stats.isError) {
    const missing = stats.error instanceof ApiError && stats.error.status === 404;
    return <FormMessage>{missing ? m.story_not_found() : m.error_generic()}</FormMessage>;
  }

  const { story, window, totals, chapters } = stats.data;
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <p className="text-xl font-extrabold">{story.title}</p>
        <p className="text-sm text-muted-foreground">
          {m.dashboard_window({ from: formatDate(window.from), to: formatDate(window.to) })}
        </p>
      </div>
      <StatsTotals totals={totals} />
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-extrabold">{m.dashboard_chapters_heading()}</h2>
        <ChapterStatsSection chapters={chapters} />
      </section>
    </div>
  );
}
