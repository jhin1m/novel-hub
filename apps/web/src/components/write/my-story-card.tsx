import type { AuthorStoryView } from '@novel-hub/core';
import { m } from '@novel-hub/shared/messages';
import { Link } from '@tanstack/react-router';
import { ChevronRightIcon } from 'lucide-react';
import { coverColorVar } from '../../lib/cover-palette';
import { formatWordCount } from '../../lib/format';
import { StoryVisibilityBadge } from '../status-badges';
import { STORY_STATUS_LABELS } from '../story/story-labels';
import { StoryCover } from '../story-cover';

// The writing area is never publicly cached, so the browser's own time zone is fine here.
const dateFormat = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' });

/**
 * One of the author's stories on `/write`, as a horizontal card. The title is the card's only link,
 * stretched over the whole card, so the cover and the "Quản lý" hint are clickable without a second
 * link competing for the same name. The stats link sits above it with a name of its own.
 */
export function MyStoryCard({ story, authorName }: { story: AuthorStoryView; authorName: string }) {
  return (
    <li className="relative flex items-stretch gap-4 rounded-[18px] border border-border bg-card p-3 transition-colors hover:border-primary/40 md:gap-5 md:p-4">
      <StoryCover
        title={story.title}
        authorName={authorName}
        mainTagSlug={story.mainTag.slug}
        coverUrl={story.coverUrl}
        sizes="(min-width: 768px) 112px, 76px"
        className="w-[76px] shrink-0 self-start rounded-sm md:w-[112px]"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <StoryVisibilityBadge visibility={story.visibility} />
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            {/* Only a numeric palette slot reaches `style`, never user text. */}
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: coverColorVar(story.mainTag.slug) }}
            />
            <span className="truncate">{story.mainTag.name}</span>
          </span>
        </div>
        <h2 className="line-clamp-2 text-lg leading-snug font-extrabold md:text-xl">
          <Link
            to="/write/stories/$publicId"
            params={{ publicId: story.publicId }}
            className="underline-offset-4 outline-hidden after:absolute after:inset-0 after:rounded-[18px] hover:underline focus-visible:after:ring-[3px] focus-visible:after:ring-ring"
          >
            {story.title}
          </Link>
        </h2>
        <p className="text-[13px] text-muted-foreground">
          {[
            STORY_STATUS_LABELS[story.status](),
            m.writer_chapter_count({ count: String(story.chapterCount) }),
            m.story_card_words({ count: formatWordCount(story.wordCount) }),
          ].join(' · ')}
        </p>
        <p className="text-xs text-muted-foreground">
          {m.writer_updated_at({ date: dateFormat.format(new Date(story.updatedAt)) })}
        </p>
        <div className="mt-auto flex items-center gap-5 pt-2 text-sm font-bold text-primary">
          <span aria-hidden="true" className="hidden md:inline">
            {m.writer_manage()} →
          </span>
          {/* Above the stretched title link, with a padded hit area so a near-miss is not a manage click. */}
          <Link
            to="/write/stories/$publicId/stats"
            params={{ publicId: story.publicId }}
            className="relative z-10 -mx-2 -my-2 rounded-full px-2 py-2 underline-offset-4 outline-hidden hover:underline focus-visible:ring-[3px] focus-visible:ring-ring"
          >
            {m.writer_stats_link()}
          </Link>
        </div>
      </div>
      <ChevronRightIcon
        aria-hidden="true"
        className="size-5 shrink-0 self-center text-muted-foreground md:hidden"
      />
    </li>
  );
}
