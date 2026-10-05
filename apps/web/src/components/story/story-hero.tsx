import type { StoryStatus } from '@novel-hub/shared';
import { canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import type { CSSProperties } from 'react';
import { coverColorVar } from '../../lib/cover-palette';
import { formatInitial } from '../../lib/format';
import { ContinueReadingButton } from '../library/continue-reading-button';
import { LibraryButton } from '../library/library-button';
import { StoryCover } from '../story-cover';
import { STORY_STATUS_LABELS } from './story-labels';
import { StoryMeta } from './story-meta';

export interface StoryHeroStory {
  publicId: string;
  slug: string;
  title: string;
  coverUrl: string | null;
  author: { username: string; displayName: string };
  mainTag: { slug: string; name: string };
  status: StoryStatus;
  chapterCount: number;
  wordCount: number;
  lastChapterAt: string | null;
  isAiAssisted: boolean;
  isMature: boolean;
}

// The site focus ring (`--ring`) is lost on some cover colours, so the mark uses `--cover-fg`.
const BREADCRUMB_LINK =
  'rounded-sm underline-offset-4 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--cover-fg) focus-visible:outline-solid';

const OUTLINE_CHIP = 'rounded-full border border-(--cover-fg) px-3 py-1 text-xs font-bold';

/**
 * Top of the story page on the main tag's cover colour, kept in `--story-tint` for the parts that
 * reuse it as a text colour. Every text is `--cover-fg`, ranked by size and weight rather than
 * opacity, so each line keeps the cover pair's contrast. One grid in DOM order (cover, title
 * block, figures, actions): the cover spans the rows on a wide screen and sits beside the title
 * block on a narrow one, with figures and actions full width below.
 */
export function StoryHero({
  story,
  chaptersPerWeek,
  firstChapterNumber,
}: {
  story: StoryHeroStory;
  chaptersPerWeek: number | null;
  firstChapterNumber: number | null;
}) {
  const tagHref = canonicalPath({ kind: 'tag', slug: story.mainTag.slug });
  // Only a numeric palette slot reaches `style`, never user text.
  const tint = { '--story-tint': coverColorVar(story.mainTag.slug) } as CSSProperties;
  return (
    <section
      aria-labelledby="story-title"
      className="bg-(--story-tint) text-(--cover-fg)"
      style={tint}
    >
      <div className="mx-auto max-w-[1240px] px-4 pt-4 pb-[52px] md:px-8 md:pt-5 md:pb-24">
        <nav aria-label={m.story_page_breadcrumb()} className="mb-4 text-[13px] font-semibold">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <a href="/" className={BREADCRUMB_LINK}>
                {m.nav_home()}
              </a>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <a href={tagHref} className={BREADCRUMB_LINK}>
                {story.mainTag.name}
              </a>
            </li>
          </ol>
        </nav>
        <div className="grid grid-cols-[132px_minmax(0,1fr)] gap-x-4 gap-y-5 md:grid-cols-[232px_minmax(0,1fr)] md:grid-rows-[auto_auto_auto_1fr] md:gap-x-10">
          <StoryCover
            title={story.title}
            authorName={story.author.displayName}
            mainTagSlug={story.mainTag.slug}
            coverUrl={story.coverUrl}
            sizes="(min-width: 768px) 232px, 132px"
            priority
            className="rounded-2xl border border-(--cover-fg)/30 shadow-[0_22px_48px_rgba(0,0,0,0.27)] md:row-span-4"
          />
          <div className="flex min-w-0 flex-col items-start gap-3 md:gap-4 md:pt-2">
            <ul className="flex flex-wrap gap-2">
              <li>
                <a
                  href={tagHref}
                  className="inline-flex rounded-full bg-(--cover-fg) px-3 py-1 text-xs font-bold text-(--story-tint) outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--cover-fg) focus-visible:outline-solid"
                >
                  {story.mainTag.name}
                </a>
              </li>
              <li className={OUTLINE_CHIP}>{STORY_STATUS_LABELS[story.status]()}</li>
              {story.isAiAssisted ? <li className={OUTLINE_CHIP}>{m.story_card_ai()}</li> : null}
              {story.isMature ? <li className={OUTLINE_CHIP}>{m.story_card_mature()}</li> : null}
            </ul>
            {/* Focus target once the 18+ screen goes away. */}
            <h1
              id="story-title"
              tabIndex={-1}
              className="text-2xl leading-tight font-extrabold tracking-tight text-balance wrap-anywhere outline-none md:text-5xl md:leading-[1.08]"
            >
              {story.title}
            </h1>
            <a
              href={canonicalPath({ kind: 'author', username: story.author.username })}
              className="inline-flex max-w-full items-center gap-2 rounded-full border border-(--cover-fg)/40 py-1 pr-3.5 pl-1 text-sm font-semibold outline-none hover:bg-(--cover-fg)/10 focus-visible:ring-[3px] focus-visible:ring-(--cover-fg)"
            >
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-(--cover-fg) text-xs font-extrabold text-(--story-tint)"
              >
                {formatInitial(story.author.displayName)}
              </span>
              <span className="truncate">{story.author.displayName}</span>
            </a>
          </div>
          <div className="col-span-2 md:col-span-1 md:col-start-2">
            <StoryMeta
              chapterCount={story.chapterCount}
              wordCount={story.wordCount}
              chaptersPerWeek={chaptersPerWeek}
              lastChapterAt={story.lastChapterAt}
            />
          </div>
          <div className="col-span-2 flex flex-wrap items-center gap-2.5 md:col-span-1 md:col-start-2">
            {/* On a narrow screen the sticky bar at the bottom carries the reading link. */}
            {firstChapterNumber !== null ? (
              <div className="hidden flex-wrap gap-2.5 md:flex">
                <ContinueReadingButton
                  story={story}
                  firstChapterNumber={firstChapterNumber}
                  size="lg"
                  showRestart
                  tone="on-cover"
                />
              </div>
            ) : null}
            <LibraryButton publicId={story.publicId} tone="on-cover" />
          </div>
        </div>
      </div>
    </section>
  );
}
