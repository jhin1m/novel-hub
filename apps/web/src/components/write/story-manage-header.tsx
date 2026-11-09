import type { AuthorStoryView } from '@novel-hub/core';
import { m } from '@novel-hub/shared/messages';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { formatDecimal, formatWordCount } from '../../lib/format';
import { StoryStatusBadge, StoryVisibilityBadge } from '../status-badges';

// The writing area is never publicly cached, so the browser's own time zone is fine here.
const dateFormat = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' });

/**
 * Band at the top of the story management page: the story's name and state, its totals and the
 * way to its stats. The cover stays in the cover card below, so it is not shown twice. The name is
 * not a heading; the page's `h1` is "Sửa truyện".
 */
export function StoryManageHeader({ story }: { story: AuthorStoryView }) {
  // `chapterCount` and `wordCount` only include published chapters that are not deleted.
  const stats = [
    {
      key: 'chapters',
      label: m.writer_stat_published_chapters(),
      value: formatDecimal(story.chapterCount),
      className: 'text-xl font-extrabold tabular-nums md:text-[28px]',
    },
    {
      key: 'words',
      label: m.writer_stat_words(),
      value: formatWordCount(story.wordCount),
      className: 'text-xl font-extrabold tabular-nums md:text-[28px]',
    },
    {
      key: 'updated',
      label: m.story_page_stat_updated(),
      value: dateFormat.format(new Date(story.updatedAt)),
      // A date is longer than a count; a smaller face keeps three columns on a phone.
      className: 'text-sm font-bold md:text-lg',
    },
  ];

  return (
    <section className="flex flex-col gap-5 rounded-[28px] bg-band p-6 md:p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <StoryVisibilityBadge visibility={story.visibility} />
            <StoryStatusBadge status={story.status} />
          </div>
          <p className="text-xl leading-tight font-extrabold break-words md:text-2xl">
            {story.title}
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="self-start">
          <Link to="/write/stories/$publicId/stats" params={{ publicId: story.publicId }}>
            {m.writer_stats_link()}
          </Link>
        </Button>
      </div>
      <dl className="grid grid-cols-3 divide-x divide-border md:flex">
        {stats.map((stat) => (
          // `dt` before `dd` in the markup; `flex-col-reverse` shows the value on top.
          <div
            key={stat.key}
            className="flex min-w-0 flex-col-reverse justify-end gap-0.5 px-3 first:pl-0 last:pr-0 md:px-8"
          >
            <dt className="text-[13px] text-muted-foreground">{stat.label}</dt>
            <dd className={`leading-tight ${stat.className}`}>{stat.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
