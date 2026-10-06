import {
  type ContestIneligibleReason,
  type OpenContestForStoryDto,
  canonicalPath,
} from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { useId } from 'react';
import { apiErrorMessage } from '../../lib/api-errors';
import { useContestEntry, useOpenContests } from '../../lib/contests';
import { formatDateTime } from '../../lib/format';
import { textLinkClass } from '../auth-ui';
import { pageCardClass } from '../page-shell';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

const REASON_LABELS: Record<ContestIneligibleReason, () => string> = {
  not_published: m.contest_reason_not_published,
  mature: m.contest_reason_mature,
  too_old: m.contest_reason_too_old,
};

function OpenContestRow({
  publicId,
  contest,
}: {
  publicId: string;
  contest: OpenContestForStoryDto;
}) {
  const entry = useContestEntry(publicId);
  // The row's button repeats on every row; the title tells them apart for screen readers.
  const titleId = useId();
  return (
    <article className="flex flex-col gap-2 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={titleId} className="font-semibold">
          <a
            href={canonicalPath({ kind: 'contest', slug: contest.slug })}
            className={textLinkClass}
          >
            {contest.title}
          </a>
        </h3>
        {contest.entered ? <Badge>{m.contest_entered()}</Badge> : null}
      </div>
      <p className="text-sm text-muted-foreground">
        {m.contest_panel_ends({ date: formatDateTime(contest.endsAt) })}
      </p>
      {contest.entered ? (
        <div>
          <Button
            size="sm"
            variant="outline"
            aria-describedby={titleId}
            disabled={entry.isPending}
            onClick={() => entry.mutate({ slug: contest.slug, enter: false })}
          >
            {m.contest_withdraw()}
          </Button>
        </div>
      ) : contest.eligible ? (
        <div>
          <Button
            size="sm"
            aria-describedby={titleId}
            disabled={entry.isPending}
            onClick={() => entry.mutate({ slug: contest.slug, enter: true })}
          >
            {m.contest_enter()}
          </Button>
        </div>
      ) : contest.reason ? (
        <p className="text-sm text-muted-foreground">{REASON_LABELS[contest.reason]()}</p>
      ) : null}
      {entry.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {apiErrorMessage(entry.error)}
        </p>
      ) : null}
    </article>
  );
}

/**
 * "Open contests" on the author's story page: enter or withdraw this story, or why it cannot
 * enter. Shown only while at least one contest is open.
 */
export function ContestEntryPanel({ publicId }: { publicId: string }) {
  const open = useOpenContests(publicId);
  if (!open.data || open.data.length === 0) return null;
  return (
    <section aria-labelledby="contest-panel" className={pageCardClass}>
      <h2 id="contest-panel" className="mb-2 text-lg font-semibold">
        {m.contest_panel_title()}
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">{m.contest_panel_intro()}</p>
      <ul className="flex flex-col gap-3">
        {open.data.map((contest) => (
          <li key={contest.slug}>
            <OpenContestRow publicId={publicId} contest={contest} />
          </li>
        ))}
      </ul>
    </section>
  );
}
