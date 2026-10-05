import {
  READER_FONTS,
  READER_THEMES,
  type ReaderFont,
  type ReaderRange,
  type ReaderTheme,
} from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { type ReactNode, useId } from 'react';
import { cn } from '@/lib/utils';

const THEME_LABELS: Record<ReaderTheme, () => string> = {
  white: m.reader_settings_theme_white,
  ivory: m.reader_settings_theme_ivory,
  sepia: m.reader_settings_theme_sepia,
  'soft-green': m.reader_settings_theme_soft_green,
  'dark-gray': m.reader_settings_theme_dark_gray,
  'oled-black': m.reader_settings_theme_oled_black,
};

const FONT_LABELS: Record<ReaderFont, () => string> = {
  'source-serif-4': m.reader_settings_font_source_serif_4,
  literata: m.reader_settings_font_literata,
  'noto-serif': m.reader_settings_font_noto_serif,
  'plus-jakarta-sans': m.reader_settings_font_plus_jakarta_sans,
};

/*
 * How a segment looks; the radio itself is visually hidden and styles its label via `peer`.
 * `tile`: bordered button, `segment`: one tab of a pill group (the group draws the track),
 * `bare`: no frame, the option draws its own (colour swatches).
 */
const OPTION_STYLES = {
  tile: 'min-h-11 rounded-xl border px-2 py-2 text-center text-sm leading-tight peer-checked:border-primary peer-checked:bg-primary-soft peer-checked:ring-1 peer-checked:ring-primary',
  segment:
    'h-10 rounded-full px-3 text-sm text-muted-foreground peer-checked:bg-card peer-checked:font-semibold peer-checked:text-foreground peer-checked:shadow-xs peer-checked:ring-1 peer-checked:ring-border',
  bare: 'rounded-xl py-1',
} as const;

/** A row of radio buttons styled as segments; arrow keys move between them natively. */
export function ChoiceGroup<T extends string>({
  legend,
  options,
  value,
  labels,
  onChange,
  renderOption,
  variant = 'tile',
  className,
  fieldsetClassName,
}: {
  legend: string;
  options: readonly T[];
  value: T | undefined;
  labels: Record<T, () => string>;
  onChange: (value: T) => void;
  renderOption?: (option: T, label: string, checked: boolean) => ReactNode;
  variant?: keyof typeof OPTION_STYLES;
  className?: string;
  fieldsetClassName?: string;
}) {
  const name = useId();
  return (
    <fieldset className={cn('flex flex-col gap-2', fieldsetClassName)}>
      <legend className="mb-2 text-sm font-semibold">{legend}</legend>
      <div className={cn(variant === 'segment' && 'rounded-full bg-secondary p-1', className)}>
        {options.map((option) => {
          const label = labels[option]();
          const checked = value === option;
          return (
            <label key={option} className="cursor-pointer">
              <input
                type="radio"
                name={name}
                value={option}
                checked={checked}
                onChange={() => onChange(option)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  'flex h-full items-center justify-center transition-colors',
                  OPTION_STYLES[variant],
                  'peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring',
                )}
              >
                {renderOption ? renderOption(option, label, checked) : label}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** The six reading presets, each previewed in its own colours ("Aa" in the content serif). */
export function ThemeSwatches({
  value,
  onChange,
}: {
  value: ReaderTheme | undefined;
  onChange: (theme: ReaderTheme) => void;
}) {
  return (
    <ChoiceGroup
      legend={m.reader_settings_theme()}
      options={READER_THEMES}
      value={value}
      labels={THEME_LABELS}
      onChange={onChange}
      variant="bare"
      renderOption={(theme, label, checked) => (
        <span className="flex flex-col items-center gap-1.5 text-center text-xs leading-tight">
          {/* The preset's own colours: `data-reader-theme` scopes them to the swatch. */}
          <span
            data-reader-theme={theme}
            aria-hidden
            className={cn(
              'flex size-12 items-center justify-center rounded-full bg-reader-bg font-serif text-base text-reader-fg',
              checked ? 'border-2 border-primary' : 'border border-border',
            )}
          >
            Aa
          </span>
          {label}
        </span>
      )}
      className="grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-6 lg:grid-cols-3"
    />
  );
}

/**
 * Reading fonts. Labels use the interface font on purpose: rendering each in its own face would
 * download every optional font as soon as the panel opens.
 */
export function FontChoices({
  value,
  onChange,
}: {
  value: ReaderFont;
  onChange: (font: ReaderFont) => void;
}) {
  return (
    <ChoiceGroup
      legend={m.reader_settings_font()}
      options={READER_FONTS}
      value={value}
      labels={FONT_LABELS}
      onChange={onChange}
      className="grid grid-cols-2 gap-2 lg:grid-cols-4"
    />
  );
}

/** A slider; values are rounded so float steps (0.1) never store `1.7000000000000002`. */
export function RangeField({
  label,
  range,
  value,
  unit = '',
  onChange,
}: {
  label: string;
  range: ReaderRange;
  value: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-sm">
        <label htmlFor={id} className="font-semibold">
          {label}
        </label>
        <output htmlFor={id} className="text-muted-foreground tabular-nums">
          {value}
          {unit}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        aria-valuetext={`${value}${unit}`}
        onChange={(event) => onChange(Math.round(Number(event.target.value) * 100) / 100)}
        className="w-full cursor-pointer rounded-full accent-primary focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none"
      />
    </div>
  );
}
