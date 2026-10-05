import { canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { Button } from '@/components/ui/button';
import { useContinueReading } from '@/lib/library';
import { useMe } from '@/lib/me';
import { setResumeHandoff } from '@/lib/reader/resume-handoff';
import { cn } from '@/lib/utils';
import { ON_COVER_OUTLINE, ON_COVER_SOLID } from '../story/on-cover-classes';

interface StoryRef {
  slug: string;
  publicId: string;
}

/**
 * A link to chapter `number` that opens it where the reader left it: a click hands the position to
 * the chapter page, then loads the (CDN-cached) chapter as a full document. The URL never carries
 * the position, so a new tab or a copied link opens the chapter at the top.
 */
export function ResumeLink({
  story,
  number,
  scrollPct,
  size,
  className,
}: {
  story: StoryRef;
  number: number;
  scrollPct: number;
  size?: 'sm' | 'lg';
  className?: string;
}) {
  const href = canonicalPath({ kind: 'chapter', ...story, number });
  return (
    <Button asChild size={size} className={className}>
      <a
        href={href}
        onClick={(event) => {
          if (
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          ) {
            return;
          }
          event.preventDefault();
          setResumeHandoff({ publicId: story.publicId, number, scrollPct });
          window.location.assign(href);
        }}
      >
        {m.continue_reading({ number: String(number) })}
      </a>
    </Button>
  );
}

/**
 * "Start reading" as the server renders it for everyone; once the browser knows the reader has
 * progress in the story, "Continue chapter N" in the same place, plus "Start reading" beside it
 * when `showRestart` is set. `tone="on-cover"` is for the cover-coloured story hero.
 */
export function ContinueReadingButton({
  story,
  firstChapterNumber,
  className,
  size,
  showRestart = false,
  tone = 'default',
}: {
  story: StoryRef;
  firstChapterNumber: number;
  className?: string;
  size?: 'sm' | 'lg';
  showRestart?: boolean;
  tone?: 'default' | 'on-cover';
}) {
  const me = useMe();
  const progress = useContinueReading(story.publicId, !!me.data).data;
  const onCover = tone === 'on-cover';
  const startHref = canonicalPath({ kind: 'chapter', ...story, number: firstChapterNumber });

  if (!progress) {
    return (
      <Button asChild size={size} className={cn(onCover && ON_COVER_SOLID, className)}>
        <a href={startHref}>{m.story_page_start()}</a>
      </Button>
    );
  }
  return (
    <>
      <ResumeLink
        story={story}
        number={progress.chapterNumber}
        scrollPct={progress.scrollPct}
        size={size}
        className={cn(onCover && ON_COVER_SOLID, className)}
      />
      {showRestart ? (
        <Button
          asChild
          variant="outline"
          size={size}
          className={cn(onCover && ON_COVER_OUTLINE, className)}
        >
          <a href={startHref}>{m.story_page_start()}</a>
        </Button>
      ) : null}
    </>
  );
}
