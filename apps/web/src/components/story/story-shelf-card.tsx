import type { StoryCardDto } from '@novel-hub/core';
import { canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { cn } from '../../lib/utils';
import { StoryCover } from '../story-cover';
import { Badge } from '../ui/badge';

const FLAG_CLASS = 'h-[18px] px-1';

/** "N chương · thể loại", the meta of a shelf with no latest chapter to name. */
export function chapterCountMeta(story: StoryCardDto): string {
  return `${m.story_card_chapters({ count: String(story.chapterCount) })} · ${story.mainTag.name}`;
}

/** One line of text under a title: the text truncates, the AI and 18+ labels never do. */
export function StoryMetaLine({
  story,
  text,
  className,
}: {
  story: StoryCardDto;
  text: string;
  className?: string;
}) {
  return (
    <p className={cn('flex min-w-0 items-center gap-1 text-muted-foreground', className)}>
      <span className="min-w-0 truncate">{text}</span>
      {story.isAiAssisted ? (
        <Badge variant="outline" className={FLAG_CLASS}>
          {m.story_shelf_ai()}
        </Badge>
      ) : null}
      {story.isMature ? (
        <Badge variant="destructive" className={FLAG_CLASS}>
          {m.story_card_mature()}
        </Badge>
      ) : null}
    </p>
  );
}

/**
 * A cover standing on a shelf line, with the title and one line of meta. The title is the card's
 * only link, stretched over the whole card, so the shelf lines of neighbouring cards can join up.
 * `compact` shows the title alone, for narrow sidebars.
 */
export function StoryShelfCard({
  story,
  meta,
  compact = false,
}: {
  story: StoryCardDto;
  /** The line under the title; ignored when `compact`. */
  meta?: string;
  compact?: boolean;
}) {
  return (
    <article
      className={cn('group relative', compact ? 'px-[7px]' : 'px-3 max-sm:pr-3.5 max-sm:pl-0')}
    >
      <StoryCover
        title={story.title}
        authorName={story.author.displayName}
        mainTagSlug={story.mainTag.slug}
        coverUrl={story.coverUrl}
        sizes={compact ? '120px' : '(min-width: 640px) 200px, 136px'}
        className={
          compact
            ? 'rounded-[5px_5px_2px_2px] shadow-[0_6px_10px_-5px_rgba(43,39,34,.45)]'
            : 'rounded-[6px_6px_2px_2px] shadow-[0_8px_14px_-6px_rgba(43,39,34,.45)]'
        }
      />
      <div
        aria-hidden="true"
        className={cn(
          // Positioned to paint over the shadow of the cover, keeping the line one even colour.
          'relative bg-(--shelf-line)',
          compact
            ? '-mx-[7px] mb-2 h-1'
            : '-mx-3 mb-3 h-[5px] max-sm:mr-[-14px] max-sm:mb-2.5 max-sm:ml-0',
        )}
      />
      <h3
        className={cn(
          'line-clamp-2 font-bold',
          compact ? 'text-[13px]' : 'text-[15px] max-sm:text-sm',
          // After the sizes: `cn` drops a line height that a later font size would override.
          'leading-[1.3]',
        )}
      >
        <a
          href={canonicalPath({ kind: 'story', slug: story.slug, publicId: story.publicId })}
          className="underline-offset-4 outline-none group-hover:underline after:absolute after:inset-0 focus-visible:after:ring-[3px] focus-visible:after:ring-ring"
        >
          {story.title}
        </a>
      </h3>
      {!compact && meta ? (
        <StoryMetaLine story={story} text={meta} className="mt-1 text-[13px] max-sm:text-xs" />
      ) : null}
    </article>
  );
}
