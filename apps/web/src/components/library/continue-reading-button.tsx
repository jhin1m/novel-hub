import { canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { Button } from '@/components/ui/button';
import { useContinueReading } from '@/lib/library';
import { useMe } from '@/lib/me';
import { setResumeHandoff } from '@/lib/reader/resume-handoff';

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
}: {
  story: StoryRef;
  number: number;
  scrollPct: number;
  size?: 'sm';
}) {
  const href = canonicalPath({ kind: 'chapter', ...story, number });
  return (
    <Button asChild size={size}>
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
 * progress in the story, "Continue chapter N" in the same place.
 */
export function ContinueReadingButton({
  story,
  firstChapterNumber,
}: {
  story: StoryRef;
  firstChapterNumber: number;
}) {
  const me = useMe();
  const progress = useContinueReading(story.publicId, !!me.data).data;

  if (!progress) {
    return (
      <Button asChild>
        <a href={canonicalPath({ kind: 'chapter', ...story, number: firstChapterNumber })}>
          {m.story_page_start()}
        </a>
      </Button>
    );
  }
  return (
    <ResumeLink story={story} number={progress.chapterNumber} scrollPct={progress.scrollPct} />
  );
}
