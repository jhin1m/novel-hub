import { ContinueReadingButton } from '../library/continue-reading-button';

/**
 * The reading link fixed to the bottom of a narrow screen, where the hero hides its own. The site
 * frame (`bottomInset="cta"`) keeps the same height free below the footer, so nothing is covered.
 * Stays under the 18+ screen (`z-40`).
 */
export function StoryStickyCta({
  story,
  firstChapterNumber,
}: {
  story: { slug: string; publicId: string };
  firstChapterNumber: number;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card px-4 pt-[11px] pb-[calc(12px+env(safe-area-inset-bottom))] md:hidden">
      <ContinueReadingButton
        story={story}
        firstChapterNumber={firstChapterNumber}
        size="lg"
        className="w-full"
      />
    </div>
  );
}
