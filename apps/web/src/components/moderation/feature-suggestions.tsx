import { canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-errors';
import { useFeatureSuggestions } from '@/lib/moderation';
import { textLinkClass } from '../auth-ui';
import { StoryCover } from '../story-cover';

/**
 * Last month's most read stories that are not featured yet. "Feature" only fills the form below
 * (through `?story=`); the moderator still picks the period and creates the slot.
 */
export function FeatureSuggestions() {
  const suggestions = useFeatureSuggestions();
  if (suggestions.isPending) {
    return (
      <p role="status" className="text-muted-foreground">
        {m.moderation_loading()}
      </p>
    );
  }
  if (suggestions.isError) {
    return (
      <p role="alert">
        {suggestions.error instanceof ApiError && suggestions.error.status === 403
          ? m.moderation_forbidden()
          : m.error_generic()}
      </p>
    );
  }
  const { month, items } = suggestions.data;
  return (
    <section aria-labelledby="featured-suggestions" className="flex flex-col gap-3">
      <h2 id="featured-suggestions" className="text-lg font-semibold">
        {m.featured_suggestions_title({ month })}
      </h2>
      <p className="text-sm text-muted-foreground">{m.featured_suggestions_intro()}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.featured_suggestions_empty()}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {items.map(({ story, readers }) => (
            <li
              key={story.publicId}
              className="flex items-center gap-4 rounded-xl border border-border bg-card p-3"
            >
              <StoryCover
                title={story.title}
                authorName={story.author.displayName}
                mainTagSlug={story.mainTag.slug}
                coverUrl={story.coverUrl}
                sizes="40px"
                className="w-10 shrink-0"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <a href={canonicalPath({ kind: 'story', ...story })} className={textLinkClass}>
                  {story.title}
                </a>
                <span className="text-sm text-muted-foreground">
                  {m.featured_suggestions_readers({ count: readers })}
                </span>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link
                  to="/moderation"
                  search={{ tab: 'featured', status: 'open', page: 1, story: story.publicId }}
                >
                  {m.featured_suggestions_use()}
                </Link>
              </Button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
