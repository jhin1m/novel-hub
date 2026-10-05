import type { StoryCardDto } from '@novel-hub/core';
import { canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { coverColorVar } from '../../lib/cover-palette';
import { formatDate, formatWordCount } from '../../lib/format';
import { StoryFlagBadges, StoryStatusBadge } from '../status-badges';
import { StoryCover } from '../story-cover';

/**
 * A story in every public list (spec section 8), as a cover-first grid card or a compact row.
 * Each card holds exactly one link, the title, stretched over the whole card; the cover stays an
 * image, so a "Bìa truyện {title}" link never competes with the title link for the same name. A
 * plain document link, so the story page comes from the CDN-cached HTML.
 */
export function StoryCard({
  story,
  layout = 'grid',
  priority = false,
}: {
  story: StoryCardDto;
  layout?: 'grid' | 'row';
  priority?: boolean;
}) {
  const href = canonicalPath({ kind: 'story', slug: story.slug, publicId: story.publicId });
  const words = m.story_card_words({ count: formatWordCount(story.wordCount) });
  const title = (
    <a
      href={href}
      className="underline-offset-4 group-hover:underline after:absolute after:inset-0"
    >
      {story.title}
    </a>
  );
  const cover = (className: string | undefined, sizes: string) => (
    <StoryCover
      title={story.title}
      authorName={story.author.displayName}
      mainTagSlug={story.mainTag.slug}
      coverUrl={story.coverUrl}
      sizes={sizes}
      priority={priority}
      className={className}
    />
  );

  if (layout === 'row') {
    return (
      <article className="group relative flex items-center gap-3.5 rounded-lg p-3 hover:bg-secondary/60">
        {cover('w-[60px] shrink-0 rounded-sm', '60px')}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="line-clamp-2 text-[15px] leading-snug font-bold">{title}</h3>
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            {/* Only a numeric palette slot reaches `style`, never user text. */}
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: coverColorVar(story.mainTag.slug) }}
            />
            <span className="truncate">
              {story.mainTag.name} · {words}
              {story.lastChapterAt
                ? ` · ${m.story_card_updated({ date: formatDate(story.lastChapterAt) })}`
                : null}
            </span>
          </p>
          {story.isAiAssisted || story.isMature ? (
            <div className="flex flex-wrap gap-1">
              <StoryFlagBadges isAiAssisted={story.isAiAssisted} isMature={story.isMature} />
            </div>
          ) : null}
        </div>
      </article>
    );
  }

  return (
    <article className="group relative flex flex-col gap-2.5">
      {cover(undefined, '(min-width: 640px) 200px, 45vw')}
      <div className="flex min-w-0 flex-col gap-1.5">
        <h3 className="line-clamp-2 leading-snug font-bold">{title}</h3>
        <p className="truncate text-[13px] text-muted-foreground">{story.author.displayName}</p>
        <p className="text-xs text-muted-foreground">
          {story.mainTag.name} · {m.story_card_chapters({ count: String(story.chapterCount) })} ·{' '}
          {words}
        </p>
        {story.lastChapterAt ? (
          <p className="text-xs text-muted-foreground">
            {m.story_card_updated({ date: formatDate(story.lastChapterAt) })}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-1">
          <StoryStatusBadge status={story.status} />
          <StoryFlagBadges isAiAssisted={story.isAiAssisted} isMature={story.isMature} />
        </div>
      </div>
    </article>
  );
}
