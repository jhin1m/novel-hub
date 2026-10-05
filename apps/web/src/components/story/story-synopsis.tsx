import { m } from '@novel-hub/shared/messages';
import { useState } from 'react';
import { cn } from '../../lib/utils';

/** Above this length a narrow screen shows the first lines and a "show more" toggle. */
const CLAMP_FROM_LENGTH = 300;

/**
 * The story synopsis in the content face. The HTML always holds the full text; on a narrow
 * screen a long one is clamped to five lines until the reader expands it.
 */
export function StorySynopsis({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const clampable = text.length > CLAMP_FROM_LENGTH;
  return (
    <div className="flex flex-col items-start gap-2">
      <p
        id="story-synopsis"
        className={cn(
          'font-serif text-[17px] leading-[1.7] whitespace-pre-line md:text-[19px] md:leading-[1.75]',
          clampable && !expanded && 'max-md:line-clamp-5',
        )}
      >
        {text}
      </p>
      {clampable ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="story-synopsis"
          onClick={() => setExpanded((open) => !open)}
          className="rounded-sm text-sm font-bold text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring md:hidden"
        >
          {expanded ? m.story_page_synopsis_less() : m.story_page_synopsis_more()}
        </button>
      ) : null}
    </div>
  );
}
