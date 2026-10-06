import { type ContestListDto, type ContestSummaryDto, canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { CONTEST_STATUS_LABELS, contestPeriod } from './contest-labels';

const GROUPS = ['open', 'upcoming', 'ended'] as const;

function ContestItem({ contest }: { contest: ContestSummaryDto }) {
  return (
    <article className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4">
      <h3 className="text-lg font-semibold">
        <a
          href={canonicalPath({ kind: 'contest', slug: contest.slug })}
          className="underline-offset-4 hover:underline focus-visible:underline"
        >
          {contest.title}
        </a>
      </h3>
      <p className="text-sm text-muted-foreground">
        {contestPeriod(contest)} · {m.contest_entry_count({ count: String(contest.entryCount) })}
      </p>
    </article>
  );
}

/** `/contests`: running, upcoming and recently ended contests, one section each. */
export function ContestList({ list }: { list: ContestListDto }) {
  return (
    <div className="flex flex-col gap-8">
      {GROUPS.map((group) => (
        <section key={group} aria-labelledby={`contests-${group}`} className="flex flex-col gap-3">
          <h2 id={`contests-${group}`} className="text-xl font-semibold">
            {CONTEST_STATUS_LABELS[group]()}
          </h2>
          {list[group].length === 0 ? (
            <p className="text-muted-foreground">{m.contest_group_empty()}</p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {list[group].map((contest) => (
                <li key={contest.slug}>
                  <ContestItem contest={contest} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
