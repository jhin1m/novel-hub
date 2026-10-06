import {
  FEATURED_RULES,
  type FeaturedSlotDto,
  type FeaturedSlotListDto,
  canonicalPath,
} from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { ApiError, apiErrorMessage } from '@/lib/api-errors';
import { useChangeFeaturedSlot, useFeaturedSlots } from '@/lib/moderation';
import { textLinkClass } from '../auth-ui';
import { StoryCover } from '../story-cover';
import { ConfirmDialog } from './confirm-dialog';

const timeFormat = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Ho_Chi_Minh',
});

const GROUPS: { key: keyof FeaturedSlotListDto; title: () => string; hint?: () => string }[] = [
  {
    key: 'active',
    title: m.featured_group_active,
    hint: () => m.featured_group_active_hint({ limit: FEATURED_RULES.homeLimit }),
  },
  { key: 'upcoming', title: m.featured_group_upcoming },
  { key: 'ended', title: () => m.featured_group_ended({ days: FEATURED_RULES.endedListDays }) },
];

function SlotRow({ slot }: { slot: FeaturedSlotDto }) {
  const change = useChangeFeaturedSlot();
  // The row's buttons repeat on every row; the title tells them apart for screen readers.
  const titleId = useId();
  const { story } = slot;
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
        <h3 id={titleId} className="font-semibold">
          <a href={canonicalPath({ kind: 'story', ...story })} className={textLinkClass}>
            {story.title}
          </a>
        </h3>
        <p className="text-sm text-muted-foreground">
          {m.featured_period({
            from: timeFormat.format(new Date(slot.startsAt)),
            to: timeFormat.format(new Date(slot.endsAt)),
          })}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {slot.state === 'active' ? (
            <ConfirmDialog
              trigger={
                <Button
                  size="sm"
                  variant="outline"
                  aria-describedby={titleId}
                  disabled={change.isPending}
                >
                  {m.featured_end_now()}
                </Button>
              }
              title={m.featured_confirm_end_title({ title: story.title })}
              description={m.featured_confirm_end_description()}
              onConfirm={() => change.mutate({ id: slot.id, change: 'end' })}
            />
          ) : null}
          {slot.state === 'upcoming' ? (
            <Button
              size="sm"
              variant="outline"
              aria-describedby={titleId}
              disabled={change.isPending}
              onClick={() => change.mutate({ id: slot.id, change: 'delete' })}
            >
              {m.featured_delete()}
            </Button>
          ) : null}
          {change.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {apiErrorMessage(change.error)}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/** The moderator's featured slots in three groups, with "end now" and "delete" where they apply. */
export function FeaturedSlotList() {
  const list = useFeaturedSlots();
  if (list.isPending) {
    return (
      <p role="status" className="text-muted-foreground">
        {m.moderation_loading()}
      </p>
    );
  }
  if (list.isError) {
    return (
      <p role="alert">
        {list.error instanceof ApiError && list.error.status === 403
          ? m.moderation_forbidden()
          : m.error_generic()}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-8">
      {GROUPS.map(({ key, title, hint }) => (
        <section key={key} aria-labelledby={`featured-${key}`} className="flex flex-col gap-3">
          <h2 id={`featured-${key}`} className="text-lg font-semibold">
            {title()}
          </h2>
          {hint ? <p className="text-sm text-muted-foreground">{hint()}</p> : null}
          {list.data[key].length === 0 ? (
            <p className="text-sm text-muted-foreground">{m.featured_group_empty()}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {list.data[key].map((slot) => (
                <li key={slot.id}>
                  <SlotRow slot={slot} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
