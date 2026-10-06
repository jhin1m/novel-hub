import type { ContestSummaryDto } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { PageTitle, pageCardClass } from '../page-shell';
import { Badge } from '../ui/badge';
import { CONTEST_STATUS_LABELS, contestPeriod } from './contest-labels';

/**
 * Top of a contest page: status, title, period, then the theme and rules. The description is plain
 * text shown as text nodes (never HTML), one paragraph per blank-line block, line breaks kept.
 */
export function ContestHeader({
  contest,
}: {
  contest: ContestSummaryDto & { description: string };
}) {
  const paragraphs = contest.description.split(/\n{2,}/);
  return (
    <>
      <header className="flex flex-col items-start gap-2">
        <Badge variant={contest.status === 'open' ? 'default' : 'muted'}>
          {CONTEST_STATUS_LABELS[contest.status]()}
        </Badge>
        <PageTitle>{contest.title}</PageTitle>
        <p className="text-muted-foreground">{contestPeriod(contest)}</p>
      </header>
      <section aria-labelledby="contest-rules" className={pageCardClass}>
        <h2 id="contest-rules" className="mb-3 text-lg font-semibold">
          {m.contest_rules_title()}
        </h2>
        <div className="flex flex-col gap-3 font-serif text-[17px] leading-relaxed">
          {paragraphs.map((text, index) => (
            // Paragraphs never reorder; the index is a stable key.
            <p key={index} className="whitespace-pre-line">
              {text}
            </p>
          ))}
        </div>
      </section>
    </>
  );
}
