import { FEATURED_RULES, featuredSlotCreateSchema, parseStoryRef } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { type FormEvent, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiErrorMessage } from '@/lib/api-errors';
import { useCreateFeaturedSlot } from '@/lib/moderation';
import { cn } from '@/lib/utils';
import { fromVnDateTimeLocal, toVnDateTimeLocal } from '@/lib/vn-datetime';
import { pageCardClass } from '../page-shell';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The period the form proposes: from now for the default number of days. */
function defaultPeriod(): { startsAt: string; endsAt: string } {
  const now = Date.now();
  return {
    startsAt: toVnDateTimeLocal(new Date(now)),
    endsAt: toVnDateTimeLocal(new Date(now + FEATURED_RULES.defaultDays * DAY_MS)),
  };
}

/**
 * Features a story on the home page: a story link or public id and a period in Vietnam time. The
 * story and the period are checked here for a clear message; the server checks everything again.
 */
export function FeaturedSlotForm() {
  const id = useId();
  const create = useCreateFeaturedSlot();
  const [story, setStory] = useState('');
  const [period, setPeriod] = useState(defaultPeriod);
  const [problem, setProblem] = useState<string | null>(null);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    create.reset();
    const startsAt = fromVnDateTimeLocal(period.startsAt);
    const endsAt = fromVnDateTimeLocal(period.endsAt);
    if (!parseStoryRef(story)) return setProblem(m.featured_story_invalid());
    const input = { story, startsAt: startsAt ?? '', endsAt: endsAt ?? '' };
    if (!startsAt || !endsAt || !featuredSlotCreateSchema.safeParse(input).success) {
      return setProblem(m.featured_period_invalid({ days: FEATURED_RULES.maxDays }));
    }
    setProblem(null);
    create.mutate(input, {
      onSuccess: () => {
        setStory('');
        setPeriod(defaultPeriod());
      },
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className={cn(pageCardClass, 'flex max-w-[640px] flex-col gap-4')}
    >
      <p className="text-muted-foreground">
        {m.featured_intro({ limit: FEATURED_RULES.homeLimit })}
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-story`}>{m.featured_story_label()}</Label>
        <Input
          id={`${id}-story`}
          value={story}
          onChange={(event) => setStory(event.target.value)}
          placeholder={m.featured_story_placeholder()}
          autoComplete="off"
        />
      </div>
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor={`${id}-starts`}>{m.featured_starts_label()}</Label>
          <Input
            id={`${id}-starts`}
            type="datetime-local"
            aria-describedby={`${id}-hint`}
            value={period.startsAt}
            onChange={(event) => setPeriod({ ...period, startsAt: event.target.value })}
          />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor={`${id}-ends`}>{m.featured_ends_label()}</Label>
          <Input
            id={`${id}-ends`}
            type="datetime-local"
            aria-describedby={`${id}-hint`}
            value={period.endsAt}
            onChange={(event) => setPeriod({ ...period, endsAt: event.target.value })}
          />
        </div>
      </div>
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">
        {m.featured_timezone_hint({ days: FEATURED_RULES.maxDays })}
      </p>
      <div>
        <Button type="submit" disabled={create.isPending}>
          {m.featured_submit()}
        </Button>
      </div>
      {problem ? (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}
      {create.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {apiErrorMessage(create.error)}
        </p>
      ) : null}
      {create.isSuccess ? (
        <p role="status" className="text-sm text-muted-foreground">
          {m.featured_created()}
        </p>
      ) : null}
    </form>
  );
}
