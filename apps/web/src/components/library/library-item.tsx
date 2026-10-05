import type { StoryCardDto } from '@novel-hub/core';
import { type Shelf, canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { EllipsisVerticalIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate, formatWordCount } from '@/lib/format';
import { useSetShelf } from '@/lib/library';
import { StoryCover } from '../story-cover';
import { STORY_STATUS_LABELS } from '../story/story-labels';
import { ResumeLink } from './continue-reading-button';
import { ShelfMenu } from './shelf-menu';

/**
 * A story in the reader's own lists: small cover, title (a plain document link to the CDN-cached
 * story page) and the facts of a story card (spec section 8), then the actions in `children`.
 */
export function LibraryStoryRow({ story, children }: { story: StoryCardDto; children: ReactNode }) {
  const href = canonicalPath({ kind: 'story', slug: story.slug, publicId: story.publicId });
  return (
    <article className="flex gap-4">
      <StoryCover
        title={story.title}
        authorName={story.author.displayName}
        mainTagSlug={story.mainTag.slug}
        coverUrl={story.coverUrl}
        sizes="96px"
        className="w-20 shrink-0 sm:w-24"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="font-serif leading-snug font-semibold">
          <a href={href} className="underline-offset-4 hover:underline">
            {story.title}
          </a>
        </h3>
        <p className="truncate text-sm text-muted-foreground">{story.author.displayName}</p>
        <p className="text-xs text-muted-foreground">
          {story.mainTag.name} · {STORY_STATUS_LABELS[story.status]()} ·{' '}
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
        <div className="mt-2 flex flex-wrap items-center gap-2">{children}</div>
      </div>
    </article>
  );
}

/** One story on a shelf, with "continue reading" and the shelf menu. */
export function LibraryItem({
  story,
  shelf,
  progress,
}: {
  story: StoryCardDto;
  shelf: Shelf;
  progress: { chapterNumber: number; scrollPct: number } | null;
}) {
  const setShelf = useSetShelf();
  return (
    <LibraryStoryRow story={story}>
      {progress ? (
        <ResumeLink
          story={story}
          number={progress.chapterNumber}
          scrollPct={progress.scrollPct}
          size="sm"
        />
      ) : null}
      <ShelfMenu
        shelf={shelf}
        disabled={setShelf.isPending}
        onChange={(next) => setShelf.mutate({ publicId: story.publicId, shelf: next })}
        trigger={
          <Button
            size="icon"
            variant="ghost"
            aria-label={m.library_item_actions({ title: story.title })}
          >
            <EllipsisVerticalIcon aria-hidden />
          </Button>
        }
      />
    </LibraryStoryRow>
  );
}
