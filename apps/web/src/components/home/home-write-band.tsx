import { type ContestSummaryDto, canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { TrophyIcon } from 'lucide-react';
import { formatDateTime } from '../../lib/format';
import { SectionHeading } from '../section-heading';

const CARD = 'flex flex-col gap-2 rounded-[22px] border border-border bg-card p-5';

/** One running contest; its title links to the contest page and the link covers the card. */
function ContestCard({ contest }: { contest: ContestSummaryDto }) {
  return (
    <article className={`relative ${CARD}`}>
      <h3 className="text-lg leading-snug font-bold">
        <a
          href={canonicalPath({ kind: 'contest', slug: contest.slug })}
          className="underline-offset-4 outline-none after:absolute after:inset-0 after:rounded-[22px] hover:underline focus-visible:after:ring-[3px] focus-visible:after:ring-ring"
        >
          {contest.title}
        </a>
      </h3>
      <p className="text-sm text-muted-foreground">
        {m.contest_panel_ends({ date: formatDateTime(contest.endsAt) })} ·{' '}
        {m.contest_entry_count({ count: String(contest.entryCount) })}
      </p>
    </article>
  );
}

/**
 * The band closing the home page: the contests running now and an invitation to write, as plain
 * cards (no image, no banner). The same for everyone (the HTML is cached): `/write` sends a guest
 * to sign in. Without a running contest, the invitation alone fills the band.
 */
export function HomeWriteBand({ contests }: { contests: ContestSummaryDto[] }) {
  const hasContests = contests.length > 0;
  if (!hasContests) {
    return (
      <section aria-labelledby="write-band-title" className="bg-band">
        <div className="mx-auto max-w-[760px] py-16 px-safe-4 text-center md:px-safe-8">
          <h2
            id="write-band-title"
            className="text-[clamp(34px,4vw,48px)] leading-[1.24] font-bold tracking-[-0.02em]"
          >
            {m.home_invite_band_before()}
            <span className="text-primary">{m.home_invite_band_accent()}</span>
            {m.home_invite_band_after()}
          </h2>
          <p className="mt-3.5 mb-[26px] text-base text-muted-foreground">{m.home_invite_body()}</p>
          <a
            href="/write"
            className="inline-flex h-[52px] items-center rounded-full bg-primary px-[30px] font-bold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring"
          >
            {m.home_invite_cta()}
          </a>
        </div>
      </section>
    );
  }
  return (
    <section aria-labelledby="write-band-title" className="bg-band py-11">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-5 px-safe-4 md:px-safe-8">
        <SectionHeading
          id="write-band-title"
          icon={TrophyIcon}
          title={m.home_contests_title()}
          subtitle={m.home_contests_subtitle()}
          onBand
        />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {contests.map((contest) => (
            <ContestCard key={contest.slug} contest={contest} />
          ))}
          <div className={CARD}>
            <h3 className="text-lg leading-snug font-bold">{m.home_invite_title()}</h3>
            <p className="text-sm text-muted-foreground">{m.home_invite_body()}</p>
            <a
              href="/write"
              className="mt-auto inline-flex h-11 items-center justify-center self-start rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring"
            >
              {m.home_invite_cta()}
            </a>
          </div>
        </div>
        <div className="flex justify-center">
          <a
            href={canonicalPath({ kind: 'contests' })}
            className="inline-flex h-11 items-center justify-center rounded-full border-[1.5px] border-foreground px-5 text-sm font-bold outline-none hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring"
          >
            {m.home_contests_view_all()}
          </a>
        </div>
      </div>
    </section>
  );
}
