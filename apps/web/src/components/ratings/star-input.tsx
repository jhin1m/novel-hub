import { m } from '@novel-hub/shared/messages';
import { StarIcon } from 'lucide-react';
import { useId } from 'react';
import { cn } from '../../lib/utils';

export const SCORES = [1, 2, 3, 4, 5] as const;

/**
 * Picks a score from 1 to 5: five native radios (hidden visually, kept for keyboard and screen
 * readers, each named "{n} sao") drawn as stars filled up to the choice.
 */
export function StarInput({
  value,
  onChange,
  disabled = false,
}: {
  value: number | null;
  onChange: (score: number) => void;
  disabled?: boolean;
}) {
  const name = useId();
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-1">
      <legend className="sr-only">{m.rating_score_legend()}</legend>
      <div className="flex gap-0.5">
        {SCORES.map((score) => (
          <label key={score} className={cn(!disabled && 'cursor-pointer')}>
            <input
              type="radio"
              name={name}
              value={score}
              checked={value === score}
              onChange={() => onChange(score)}
              className="peer sr-only"
            />
            <span className="sr-only">{m.rating_star_label({ count: score })}</span>
            <StarIcon
              aria-hidden
              className={cn(
                'size-8 rounded-md p-0.5 transition-colors peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring peer-disabled:opacity-50',
                value !== null && score <= value
                  ? 'fill-primary text-primary'
                  : 'text-muted-foreground',
              )}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * A read-only row of five small stars for a score (whole stars, rounded), named "{n} trên 5 sao";
 * `decorative` hides it from screen readers when the score is announced next to it.
 */
export function StarRow({
  score,
  decorative = false,
  className,
}: {
  score: number;
  decorative?: boolean;
  className?: string;
}) {
  const filled = Math.round(score);
  return (
    <span
      {...(decorative
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': m.rating_review_score({ score }) })}
      className={cn('inline-flex gap-px', className)}
    >
      {SCORES.map((n) => (
        <StarIcon
          key={n}
          aria-hidden
          className={cn(
            'size-3.5',
            n <= filled ? 'fill-primary text-primary' : 'text-muted-foreground/50',
          )}
        />
      ))}
    </span>
  );
}
