import { m } from '@novel-hub/shared/messages';
import { Button } from '@/components/ui/button';
import type { useStoryRatings } from '@/lib/ratings';
import { ReviewItem } from './review-item';

/** The reviews of the loaded pages with a "more" button; empty says so. */
export function ReviewList({ ratings }: { ratings: ReturnType<typeof useStoryRatings> }) {
  const reviews = ratings.data?.pages.flatMap((page) => page.reviews) ?? [];
  return (
    <div className="flex flex-col gap-5">
      {reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.rating_reviews_empty()}</p>
      ) : (
        <ul className="flex flex-col gap-5">
          {reviews.map((review) => (
            <li key={review.id}>
              <ReviewItem review={review} />
            </li>
          ))}
        </ul>
      )}
      {ratings.hasNextPage ? (
        <Button
          variant="secondary"
          className="self-center"
          disabled={ratings.isFetchingNextPage}
          onClick={() => void ratings.fetchNextPage()}
        >
          {m.rating_load_more()}
        </Button>
      ) : null}
    </div>
  );
}
