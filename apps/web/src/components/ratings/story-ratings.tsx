import { m } from '@novel-hub/shared/messages';
import { StarIcon } from 'lucide-react';
import { useId, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useMe } from '@/lib/me';
import { useStoryRatings } from '@/lib/ratings';
import { useNearViewport } from '@/lib/use-near-viewport';
import { SectionHeading } from '../section-heading';
import { RatingForm } from './rating-form';
import { RatingSummary } from './rating-summary';
import { ReviewList } from './review-list';

/**
 * The "Ratings" section of a story page. The server-rendered page only has the empty section (its
 * HTML is cached and the same for everyone); the summary, the reader's form and the reviews load in
 * the browser once the reader scrolls near it. Nothing loads while `enabled` is false (the 18+
 * screen is up).
 */
export function StoryRatings({
  publicId,
  authorUsername,
  enabled,
}: {
  publicId: string;
  authorUsername: string;
  enabled: boolean;
}) {
  const id = useId();
  const ref = useRef<HTMLElement>(null);
  const near = useNearViewport(ref, enabled);
  const me = useMe();
  // Waits for the session so `isOwn` is right on the first load.
  const ratings = useStoryRatings(publicId, me.data?.username ?? null, near && !me.isPending);
  const summary = ratings.data?.pages[0]?.summary ?? null;

  return (
    <section ref={ref} aria-labelledby={`${id}-heading`} className="flex flex-col gap-5">
      <SectionHeading id={`${id}-heading`} icon={StarIcon} title={m.rating_heading()} />
      {!near ? null : ratings.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          {m.rating_loading()}
        </p>
      ) : ratings.isError ? (
        <p role="alert" className="flex items-center gap-2 text-sm text-muted-foreground">
          {m.rating_load_error()}
          <Button variant="ghost" size="sm" onClick={() => void ratings.refetch()}>
            {m.rating_retry()}
          </Button>
        </p>
      ) : (
        <>
          {summary ? <RatingSummary summary={summary} /> : null}
          <RatingForm publicId={publicId} authorUsername={authorUsername} />
          <div className="flex flex-col gap-4">
            <h3 className="font-bold">{m.rating_reviews_heading()}</h3>
            <ReviewList ratings={ratings} />
          </div>
        </>
      )}
    </section>
  );
}
