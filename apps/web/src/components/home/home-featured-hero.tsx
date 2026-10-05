import type { StoryCardDto } from '@novel-hub/core';
import { canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { StarIcon } from 'lucide-react';
import { coverColorVar } from '../../lib/cover-palette';
import { STORY_STATUS_LABELS } from '../story/story-labels';
import { StoryCover } from '../story-cover';

/**
 * The home hero: one notable story on its main tag's cover colour. Server-rendered from the
 * public (never 18+) list. Every text is `--cover-fg`, ranked by size and weight rather than
 * opacity, so each line keeps the cover pair's contrast.
 */
export function HomeFeaturedHero({ story }: { story: StoryCardDto }) {
  const href = canonicalPath({ kind: 'story', slug: story.slug, publicId: story.publicId });
  // Only a numeric palette slot reaches `style`, never user text.
  const background = coverColorVar(story.mainTag.slug);
  return (
    <section
      aria-labelledby="featured-title"
      className="flex flex-[999_1_560px] items-center gap-5 rounded-3xl p-5 text-(--cover-fg) md:gap-8 md:rounded-[28px] md:p-8"
      style={{ backgroundColor: background }}
    >
      <div className="flex min-w-0 flex-1 flex-col items-start gap-3 md:gap-4">
        <p className="inline-flex items-center gap-1.5 rounded-full border border-(--cover-fg)/40 px-3 py-1 text-xs font-bold">
          <StarIcon aria-hidden="true" className="size-3.5" />
          {m.home_featured_label()}
        </p>
        <p className="text-[13px] font-semibold">
          {story.mainTag.name} · {m.story_card_chapters({ count: String(story.chapterCount) })} ·{' '}
          {STORY_STATUS_LABELS[story.status]()}
        </p>
        <h2
          id="featured-title"
          className="line-clamp-3 text-2xl leading-tight font-extrabold tracking-tight md:text-[38px]"
        >
          <a
            href={href}
            className="underline-offset-4 outline-none hover:underline focus-visible:underline"
          >
            {story.title}
          </a>
        </h2>
        <p className="text-sm font-semibold">{story.author.displayName}</p>
        <a
          href={href}
          className="mt-1 inline-flex h-12 items-center rounded-full bg-(--cover-fg) px-6 font-bold outline-none focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-(--cover-fg)"
          style={{ color: background }}
        >
          {m.home_featured_view()}
        </a>
      </div>
      <StoryCover
        title={story.title}
        authorName={story.author.displayName}
        mainTagSlug={story.mainTag.slug}
        coverUrl={story.coverUrl}
        sizes="(min-width: 768px) 196px, 96px"
        priority
        className="w-24 shrink-0 shadow-[0_20px_44px_rgba(0,0,0,0.26)] md:w-[196px]"
      />
    </section>
  );
}
