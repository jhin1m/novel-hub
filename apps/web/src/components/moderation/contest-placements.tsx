import {
  CONTEST_PLACEMENTS,
  type ContestAdminEntryDto,
  type ContestPlacement,
  type ContestStatus,
  canonicalPath,
} from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { ApiError, apiErrorMessage } from '@/lib/api-errors';
import { useContestEntries, useSetContestPlacement } from '@/lib/moderation';
import { textLinkClass } from '../auth-ui';
import { StoryCover } from '../story-cover';

function EntryRow({
  contestId,
  entry,
  ended,
}: {
  contestId: string;
  entry: ContestAdminEntryDto;
  ended: boolean;
}) {
  const place = useSetContestPlacement(contestId);
  // The row's buttons repeat on every row; the title tells them apart for screen readers.
  const titleId = useId();
  const { story } = entry;
  const choose = (placement: ContestPlacement | null) =>
    place.mutate({ story: story.publicId, placement });
  return (
    <article className="flex gap-4 rounded-xl border border-border bg-card p-4">
      <StoryCover
        title={story.title}
        authorName={story.authorName}
        mainTagSlug={story.mainTagSlug}
        coverUrl={story.coverUrl}
        sizes="56px"
        className="w-14 shrink-0"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h4 id={titleId} className="font-semibold">
          <a href={canonicalPath({ kind: 'story', ...story })} className={textLinkClass}>
            {story.title}
          </a>
        </h4>
        <p className="text-sm text-muted-foreground">{story.authorName}</p>
        {entry.listed ? null : (
          <p className="text-sm text-muted-foreground">{m.contest_entry_unlisted()}</p>
        )}
        {ended ? (
          <div
            role="group"
            aria-label={m.contest_placement_label()}
            aria-describedby={titleId}
            className="flex flex-wrap gap-2"
          >
            {CONTEST_PLACEMENTS.map((placement) => (
              <Button
                key={placement}
                size="sm"
                variant={entry.placement === placement ? 'default' : 'outline'}
                aria-pressed={entry.placement === placement}
                aria-describedby={titleId}
                disabled={place.isPending || (!entry.listed && entry.placement !== placement)}
                onClick={() => choose(placement)}
              >
                {m.contest_placement({ placement: String(placement) })}
              </Button>
            ))}
            <Button
              size="sm"
              variant={entry.placement === null ? 'default' : 'outline'}
              aria-pressed={entry.placement === null}
              aria-describedby={titleId}
              disabled={place.isPending}
              onClick={() => choose(null)}
            >
              {m.contest_placement_none()}
            </Button>
          </div>
        ) : null}
        {place.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {apiErrorMessage(place.error)}
          </p>
        ) : null}
      </div>
    </article>
  );
}

/** Entries of a contest for the moderator; places 1–3 can be awarded once it has ended. */
export function ContestPlacements({
  contestId,
  status,
}: {
  contestId: string;
  status: ContestStatus;
}) {
  const entries = useContestEntries(contestId);
  if (entries.isPending) {
    return (
      <p role="status" className="text-muted-foreground">
        {m.moderation_loading()}
      </p>
    );
  }
  if (entries.isError) {
    return (
      <p role="alert">
        {entries.error instanceof ApiError && entries.error.status === 403
          ? m.moderation_forbidden()
          : m.error_generic()}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{m.contest_placements_hint()}</p>
      {entries.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.contest_entries_empty()}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {entries.data.map((entry) => (
            <li key={entry.story.publicId}>
              <EntryRow contestId={contestId} entry={entry} ended={status === 'ended'} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
