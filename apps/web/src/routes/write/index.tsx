import { m } from '@novel-hub/shared/messages';
import { Link, createFileRoute } from '@tanstack/react-router';
import { PenLineIcon, PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormMessage } from '../../components/auth-ui';
import { SiteLayout } from '../../components/site-layout';
import { MyStoryCard } from '../../components/write/my-story-card';
import { WriterGate } from '../../components/writer-gate';
import { formatDecimal, formatWordCount } from '../../lib/format';
import { useMe } from '../../lib/me';
import { useMyStories } from '../../lib/stories';
import { seo } from '../../lib/seo';

export const Route = createFileRoute('/write/')({
  head: () => seo({ title: m.writer_title(), noindex: true }),
  component: WriterHomePage,
});

function WriterHomePage() {
  return (
    <SiteLayout>
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
        {/* Outside the gate, so the sign-in and verify-email states keep the page heading. */}
        <h1 className="text-[28px] leading-tight font-extrabold">{m.writer_title()}</h1>
        <WriterGate>
          <MyStories />
        </WriterGate>
      </div>
    </SiteLayout>
  );
}

function MyStories() {
  // Already loaded by `WriterGate`; every story here is by the signed-in author.
  const me = useMe();
  const stories = useMyStories();
  if (stories.isPending) return <p className="text-muted-foreground">{m.writer_loading()}</p>;
  if (stories.isError) return <FormMessage>{m.error_generic()}</FormMessage>;
  // The empty state carries the only "Tạo truyện mới" link, so there is never a second one.
  if (stories.data.length === 0) return <WriterEmptyState />;
  const authorName = me.data?.displayName ?? '';

  return (
    <div className="flex flex-col gap-6">
      <WriterStats stories={stories.data} />
      <ul className="grid gap-4 lg:grid-cols-[repeat(auto-fill,minmax(520px,1fr))]">
        {stories.data.map((story) => (
          <MyStoryCard key={story.publicId} story={story} authorName={authorName} />
        ))}
      </ul>
    </div>
  );
}

/**
 * Story, chapter and word totals of the author, summed from the list already loaded. Both counts
 * only include published chapters that are not deleted, hence the "chương đã đăng" label.
 */
function WriterStats({
  stories,
}: {
  stories: readonly { chapterCount: number; wordCount: number }[];
}) {
  const stats = [
    { key: 'stories', label: m.writer_stat_stories(), value: formatDecimal(stories.length) },
    {
      key: 'chapters',
      label: m.writer_stat_published_chapters(),
      value: formatDecimal(stories.reduce((sum, s) => sum + s.chapterCount, 0)),
    },
    {
      key: 'words',
      label: m.writer_stat_words(),
      value: formatWordCount(stories.reduce((sum, s) => sum + s.wordCount, 0)),
    },
  ];

  return (
    <section className="flex flex-col gap-5 rounded-[28px] bg-band p-6 md:flex-row md:items-center md:justify-between md:p-8">
      <dl
        aria-label={m.writer_stats_label()}
        className="grid grid-cols-3 divide-x divide-border md:flex"
      >
        {stats.map((stat) => (
          // `dt` before `dd` in the markup; `flex-col-reverse` shows the number on top.
          <div
            key={stat.key}
            className="flex min-w-0 flex-col-reverse justify-end gap-0.5 px-3 first:pl-0 last:pr-0 md:px-8"
          >
            <dt className="text-[13px] text-muted-foreground">{stat.label}</dt>
            <dd className="text-xl leading-tight font-extrabold tabular-nums md:text-[28px]">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
      <Button asChild size="lg" className="h-11 self-start md:h-12 md:self-auto">
        <Link to="/write/stories/new">
          <PlusIcon />
          {m.writer_new_story()}
        </Link>
      </Button>
    </section>
  );
}

function WriterEmptyState() {
  return (
    <section className="flex flex-col items-center gap-4 rounded-3xl border border-border bg-card px-6 py-14 text-center">
      <span
        aria-hidden="true"
        className="grid size-14 place-items-center rounded-full bg-primary-soft text-primary"
      >
        <PenLineIcon className="size-6" />
      </span>
      <p className="max-w-sm text-muted-foreground">{m.writer_empty()}</p>
      <Button asChild size="lg">
        <Link to="/write/stories/new">
          <PlusIcon />
          {m.writer_new_story()}
        </Link>
      </Button>
    </section>
  );
}
