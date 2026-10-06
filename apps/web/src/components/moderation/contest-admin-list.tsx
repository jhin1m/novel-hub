import { type ContestAdminDto, canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ApiError } from '@/lib/api-errors';
import { useAdminContests } from '@/lib/moderation';
import { textLinkClass } from '../auth-ui';
import { CONTEST_STATUS_LABELS, contestPeriod } from '../contests/contest-labels';
import { ContestForm } from './contest-form';
import { ContestPlacements } from './contest-placements';

function ContestRow({ contest }: { contest: ContestAdminDto }) {
  const [open, setOpen] = useState<'edit' | 'entries' | null>(null);
  // The row's buttons repeat on every row; the title tells them apart for screen readers.
  const titleId = useId();
  const toggle = (panel: 'edit' | 'entries') => setOpen(open === panel ? null : panel);
  return (
    <article
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={titleId} className="font-semibold">
          {contest.title}
        </h3>
        <Badge variant={contest.status === 'open' ? 'default' : 'muted'}>
          {CONTEST_STATUS_LABELS[contest.status]()}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        {contestPeriod(contest)} · {m.contest_entry_count({ count: String(contest.entryCount) })}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant="outline"
          aria-expanded={open === 'edit'}
          aria-describedby={titleId}
          onClick={() => toggle('edit')}
        >
          {m.contest_edit()}
        </Button>
        <Button
          size="sm"
          variant="outline"
          aria-expanded={open === 'entries'}
          aria-describedby={titleId}
          onClick={() => toggle('entries')}
        >
          {m.contest_manage_entries()}
        </Button>
        <a href={canonicalPath({ kind: 'contest', slug: contest.slug })} className={textLinkClass}>
          {m.contest_view()}
        </a>
      </div>
      {open === 'edit' ? (
        <ContestForm key={contest.id} contest={contest} onDone={() => setOpen(null)} />
      ) : null}
      {open === 'entries' ? (
        <ContestPlacements contestId={contest.id} status={contest.status} />
      ) : null}
    </article>
  );
}

/** The moderator's contests, newest start first, each with edit and ranking panels. */
export function ContestAdminList() {
  const list = useAdminContests();
  return (
    <section aria-labelledby="contests-admin" className="flex flex-col gap-3">
      <h2 id="contests-admin" className="text-lg font-semibold">
        {m.contest_admin_list_title()}
      </h2>
      {list.isPending ? (
        <p role="status" className="text-muted-foreground">
          {m.moderation_loading()}
        </p>
      ) : list.isError ? (
        <p role="alert">
          {list.error instanceof ApiError && list.error.status === 403
            ? m.moderation_forbidden()
            : m.error_generic()}
        </p>
      ) : list.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.contest_group_empty()}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.data.map((contest) => (
            <li key={contest.id}>
              <ContestRow contest={contest} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
