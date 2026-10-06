import { m } from '@novel-hub/shared/messages';
import { useId } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type PublishMode = 'now' | 'later';

const CARD_CLASS =
  'flex cursor-pointer items-center gap-3 rounded-lg border-[1.5px] px-4 py-3 text-sm font-bold ' +
  'has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring';

/**
 * "Publish now" or "schedule" as two radio cards, plus the time picker when scheduling. Labels hold
 * only the option name: tests and screen readers find the controls by it.
 */
export function PublishWhenFieldset({
  mode,
  onModeChange,
  when,
  onWhenChange,
  min,
  disabled,
}: {
  mode: PublishMode;
  onModeChange: (mode: PublishMode) => void;
  when: string;
  onWhenChange: (value: string) => void;
  min: string;
  disabled: boolean;
}) {
  const id = useId();
  const options: [PublishMode, string][] = [
    ['now', m.publish_now()],
    ['later', m.publish_later()],
  ];
  return (
    <fieldset className="flex flex-col gap-3" disabled={disabled}>
      <legend className="mb-2 text-sm font-bold">{m.publish_when_label()}</legend>
      <div className="grid grid-cols-2 gap-3">
        {options.map(([value, label]) => (
          <label key={value} className={CARD_CLASS}>
            <input
              type="radio"
              name={`${id}-mode`}
              checked={mode === value}
              onChange={() => onModeChange(value)}
              className="size-4 accent-primary focus-visible:outline-none"
            />
            {label}
          </label>
        ))}
      </div>
      {mode === 'later' ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-when`}>{m.schedule_time_label()}</Label>
          <Input
            id={`${id}-when`}
            type="datetime-local"
            required
            value={when}
            min={min}
            onChange={(e) => onWhenChange(e.target.value)}
            aria-describedby={`${id}-when-hint`}
          />
          <p id={`${id}-when-hint`} className="text-xs text-muted-foreground">
            {m.schedule_time_hint()}
          </p>
        </div>
      ) : null}
    </fieldset>
  );
}
