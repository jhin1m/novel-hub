import type { StoryCardDto } from '@novel-hub/core';
import { canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatWordCount } from '@/lib/format';
import { StoryCover } from '../story-cover';
import { STORY_STATUS_LABELS } from './story-labels';

/**
 * A story in every public list (spec section 8): cover, title, pen name, main tag, chapters,
 * words, status, last update and the AI label. The whole card is one link to the story page,
 * a plain document link so the page comes from the CDN-cached HTML.
 */
export function StoryCard({
  story,
  priority = false,
}: {
  story: StoryCardDto;
  priority?: boolean;
}) {
  const href = canonicalPath({ kind: 'story', slug: story.slug, publicId: story.publicId });
  return (
    <article className="group relative flex flex-col gap-2">
      <StoryCover
        title={story.title}
        authorName={story.author.displayName}
        mainTagSlug={story.mainTag.slug}
        coverUrl={story.coverUrl}
        sizes="(min-width: 1024px) 160px, (min-width: 640px) 30vw, 45vw"
        priority={priority}
      />
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="line-clamp-2 font-serif leading-snug font-semibold">
          <a
            href={href}
            className="underline-offset-4 group-hover:underline after:absolute after:inset-0"
          >
            {story.title}
          </a>
        </h3>
        <p className="truncate text-sm text-muted-foreground">{story.author.displayName}</p>
        <p className="text-xs text-muted-foreground">
          {story.mainTag.name} · {STORY_STATUS_LABELS[story.status]()}
        </p>
        <p className="text-xs text-muted-foreground">
          {m.story_card_chapters({ count: String(story.chapterCount) })} ·{' '}
          {m.story_card_words({ count: formatWordCount(story.wordCount) })}
        </p>
        {story.lastChapterAt ? (
          <p className="text-xs text-muted-foreground">
            {m.story_card_updated({ date: formatDate(story.lastChapterAt) })}
          </p>
        ) : null}
        {story.isAiAssisted || story.isMature ? (
          <div className="flex flex-wrap gap-1">
            {story.isAiAssisted ? <Badge variant="outline">{m.story_card_ai()}</Badge> : null}
            {story.isMature ? <Badge variant="outline">{m.story_card_mature()}</Badge> : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
