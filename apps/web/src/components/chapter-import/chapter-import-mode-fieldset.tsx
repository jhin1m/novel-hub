import {
  CHAPTER_IMPORT_LIMITS,
  CHAPTER_IMPORT_MODES,
  type ChapterImportMode,
} from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { useId } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const MODE_LABELS: Record<ChapterImportMode, () => string> = {
  draft: m.chapter_import_mode_draft,
  publish: m.chapter_import_mode_publish,
  schedule: m.chapter_import_mode_schedule,
};

const CARD_CLASS =
  'flex cursor-pointer items-center gap-3 rounded-lg border-[1.5px] px-4 py-3 text-sm font-bold ' +
  'has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring';

/**
 * What happens after the import: keep drafts, publish now, or schedule one chapter every N hours
 * from a start time, read as the device's local time like the editor's schedule.
 */
export function ChapterImportModeFieldset({
  mode,
  onModeChange,
  startAt,
  onStartAtChange,
  intervalHours,
  onIntervalHoursChange,
  minStartAt,
}: {
  mode: ChapterImportMode;
  onModeChange: (mode: ChapterImportMode) => void;
  startAt: string;
  onStartAtChange: (value: string) => void;
  intervalHours: string;
  onIntervalHoursChange: (value: string) => void;
  minStartAt: string;
}) {
  const id = useId();
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-sm font-bold">{m.chapter_import_mode()}</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {CHAPTER_IMPORT_MODES.map((value) => (
          <label key={value} className={CARD_CLASS}>
            <input
              type="radio"
              name={`${id}-mode`}
              checked={mode === value}
              onChange={() => onModeChange(value)}
              className="size-4 accent-primary focus-visible:outline-none"
            />
            {MODE_LABELS[value]()}
          </label>
        ))}
      </div>
      {mode === 'schedule' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${id}-start`}>{m.chapter_import_schedule_start()}</Label>
            <Input
              id={`${id}-start`}
              type="datetime-local"
              required
              value={startAt}
              min={minStartAt}
              onChange={(e) => onStartAtChange(e.target.value)}
              aria-describedby={`${id}-start-hint`}
            />
            <p id={`${id}-start-hint`} className="text-xs text-muted-foreground">
              {m.schedule_time_hint()}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${id}-interval`}>{m.chapter_import_schedule_interval()}</Label>
            <Input
              id={`${id}-interval`}
              type="number"
              inputMode="numeric"
              required
              min={1}
              max={CHAPTER_IMPORT_LIMITS.maxIntervalHours}
              step={1}
              value={intervalHours}
              onChange={(e) => onIntervalHoursChange(e.target.value)}
            />
          </div>
        </div>
      ) : null}
    </fieldset>
  );
}
