import { m } from '@novel-hub/shared/messages';
import { MessageSquareQuote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ParagraphSelection } from '@/lib/reader/use-paragraph-selection';
import { cn } from '@/lib/utils';

/**
 * "Comment on this paragraph", floating while the reader has text of one paragraph selected. It
 * sits outside the chapter text (nothing is added inside it), at the bottom above the reading bar,
 * or below the top bar when the selection is in the lower half of the screen; never next to the
 * selection, where phones show their own copy toolbar.
 */
export function ParagraphCommentFab({
  placement,
  onOpen,
}: {
  placement: ParagraphSelection['placement'];
  onOpen: () => void;
}) {
  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-x-0 z-30 flex justify-center px-4',
        placement === 'top'
          ? 'top-[76px] lg:top-[84px]'
          : 'bottom-[calc(88px+env(safe-area-inset-bottom))] lg:bottom-8',
      )}
    >
      <Button
        className="pointer-events-auto shadow-lg"
        // Pressing the button must not clear the selection it acts on.
        onMouseDown={(event) => event.preventDefault()}
        onClick={onOpen}
      >
        <MessageSquareQuote aria-hidden />
        {m.comment_paragraph_open()}
      </Button>
    </div>
  );
}
