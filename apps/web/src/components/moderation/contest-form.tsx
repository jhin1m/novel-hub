import { CONTEST_RULES, type ContestAdminDto, LIMITS, contestInputSchema } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { type FormEvent, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiErrorMessage } from '@/lib/api-errors';
import { useSaveContest } from '@/lib/moderation';
import { cn } from '@/lib/utils';
import { fromVnDateTimeLocal, toVnDateTimeLocal } from '@/lib/vn-datetime';
import { pageCardClass } from '../page-shell';

const DAY_MS = 24 * 60 * 60 * 1000;

interface FormValues {
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
}

/** Fields of `contest`, or a new contest from now for the default number of days. */
function initialValues(contest?: ContestAdminDto): FormValues {
  if (contest) {
    return {
      title: contest.title,
      description: contest.description,
      startsAt: toVnDateTimeLocal(contest.startsAt),
      endsAt: toVnDateTimeLocal(contest.endsAt),
    };
  }
  const now = Date.now();
  return {
    title: '',
    description: '',
    startsAt: toVnDateTimeLocal(new Date(now)),
    endsAt: toVnDateTimeLocal(new Date(now + CONTEST_RULES.defaultDays * DAY_MS)),
  };
}

/**
 * Creates a contest, or edits `contest`: title, theme and rules (plain text), period in Vietnam
 * time. Checked here for a clear message; the server checks everything again. An edit that keeps
 * the start minute keeps the stored start, so a contest with entries can still be edited.
 */
export function ContestForm({
  contest,
  onDone,
}: {
  contest?: ContestAdminDto;
  onDone?: () => void;
}) {
  const id = useId();
  const save = useSaveContest();
  const [values, setValues] = useState(() => initialValues(contest));
  const [problem, setProblem] = useState<string | null>(null);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    save.reset();
    const unchangedStart = contest && values.startsAt === toVnDateTimeLocal(contest.startsAt);
    const startsAt = unchangedStart ? contest.startsAt : fromVnDateTimeLocal(values.startsAt);
    const endsAt = fromVnDateTimeLocal(values.endsAt);
    const input = { ...values, startsAt: startsAt ?? '', endsAt: endsAt ?? '' };
    if (!startsAt || !endsAt || !contestInputSchema.safeParse(input).success) {
      return setProblem(m.contest_form_invalid({ days: LIMITS.contestMaxDays }));
    }
    setProblem(null);
    save.mutate(
      { ...input, ...(contest ? { id: contest.id } : {}) },
      {
        onSuccess: () => {
          if (!contest) setValues(initialValues());
          onDone?.();
        },
      },
    );
  }

  const field = (key: keyof FormValues) => ({
    id: `${id}-${key}`,
    value: values[key],
    onChange: (event: { target: { value: string } }) =>
      setValues({ ...values, [key]: event.target.value }),
  });

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-label={contest ? m.contest_form_edit_title() : m.contest_form_create_title()}
      className={cn(pageCardClass, 'flex max-w-[640px] flex-col gap-4')}
    >
      <h2 className="text-lg font-semibold">
        {contest ? m.contest_form_edit_title() : m.contest_form_create_title()}
      </h2>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-title`}>{m.contest_title_label()}</Label>
        <Input {...field('title')} maxLength={LIMITS.contestTitle.max} autoComplete="off" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-description`}>{m.contest_description_label()}</Label>
        <Textarea {...field('description')} rows={6} aria-describedby={`${id}-description-hint`} />
        <p id={`${id}-description-hint`} className="text-sm text-muted-foreground">
          {m.contest_description_hint({ max: LIMITS.contestDescriptionMax })}
        </p>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor={`${id}-startsAt`}>{m.contest_starts_label()}</Label>
          <Input {...field('startsAt')} type="datetime-local" aria-describedby={`${id}-hint`} />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor={`${id}-endsAt`}>{m.contest_ends_label()}</Label>
          <Input {...field('endsAt')} type="datetime-local" aria-describedby={`${id}-hint`} />
        </div>
      </div>
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">
        {m.contest_timezone_hint({ days: LIMITS.contestMaxDays })}
      </p>
      <div className="flex gap-3">
        <Button type="submit" disabled={save.isPending}>
          {contest ? m.contest_save_submit() : m.contest_create_submit()}
        </Button>
        {contest && onDone ? (
          <Button type="button" variant="outline" onClick={onDone}>
            {m.contest_cancel()}
          </Button>
        ) : null}
      </div>
      {problem ? (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}
      {save.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {apiErrorMessage(save.error)}
        </p>
      ) : null}
      {save.isSuccess && !contest ? (
        <p role="status" className="text-sm text-muted-foreground">
          {m.contest_created()}
        </p>
      ) : null}
    </form>
  );
}
