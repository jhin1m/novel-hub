import type { StoryStatsTotals } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { formatDecimal } from '../../lib/format';

/** The four story-wide numbers of the dashboard on a `--band` panel, number above its label. */
export function StatsTotals({ totals }: { totals: StoryStatsTotals }) {
  const stats = [
    { key: 'views', label: m.dashboard_views(), value: totals.views },
    { key: 'readers', label: m.dashboard_readers(), value: totals.readers },
    {
      key: 'story-follows',
      label: m.dashboard_new_story_follows(),
      value: totals.newStoryFollows,
      hint: m.dashboard_story_follows_total({ count: formatDecimal(totals.storyFollowersTotal) }),
    },
    {
      key: 'author-follows',
      label: m.dashboard_new_author_follows(),
      value: totals.newAuthorFollows,
    },
  ];

  return (
    <section className="flex flex-col gap-4 rounded-[28px] bg-band p-6 md:p-8">
      <dl
        role="group"
        aria-label={m.dashboard_totals_label()}
        className="grid grid-cols-2 gap-6 md:grid-cols-4"
      >
        {stats.map((stat) => (
          // `dt` before its `dd`s in the markup; `order` shows the number on top.
          <div key={stat.key} className="flex min-w-0 flex-col gap-0.5">
            <dt className="order-2 text-[13px] text-muted-foreground">{stat.label}</dt>
            <dd className="order-1 text-2xl leading-tight font-extrabold tabular-nums md:text-[28px]">
              {formatDecimal(stat.value)}
            </dd>
            {stat.hint ? (
              <dd className="order-3 text-xs text-muted-foreground">{stat.hint}</dd>
            ) : null}
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">{m.dashboard_readers_note()}</p>
    </section>
  );
}
