import {
  READER_ALIGNS,
  READER_FONTS,
  READER_RANGES,
  READER_THEMES,
  READER_WIDTHS,
  type ReaderAlign,
  type ReaderFont,
  type ReaderRange,
  type ReaderTheme,
  type ReaderWidth,
} from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { type ReactNode, type RefObject, useId } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useReaderSettings } from '@/lib/reader/use-reader-settings';
import { usePanelTrigger } from '@/lib/reader/use-panel-trigger';
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

const WIDTH_LABELS: Record<ReaderWidth, () => string> = {
  narrow: m.reader_settings_width_narrow,
  medium: m.reader_settings_width_medium,
  wide: m.reader_settings_width_wide,
};

const ALIGN_LABELS: Record<ReaderAlign, () => string> = {
  left: m.reader_settings_align_left,
  justify: m.reader_settings_align_justify,
};

/**
 * Display settings panel. Not modal: the page stays visible and undimmed behind it, so every
 * change previews on the chapter text right away. Opened from the reading controls (`trigger`),
 * which hold the open state.
 */
export function ReaderSettingsSheet({
  open,
  onOpenChange,
  trigger,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: RefObject<HTMLButtonElement | null>;
}) {
  const { settings, update, reset } = useReaderSettings();
  const panelFocus = usePanelTrigger(trigger, false);

  return (
    <Sheet modal={false} open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="gap-0 overflow-y-auto" {...panelFocus}>
        <SheetHeader>
          <SheetTitle>{m.reader_settings()}</SheetTitle>
          <SheetDescription>{m.reader_settings_description()}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-6 px-4 pb-6">
          <ChoiceGroup
            legend={m.reader_settings_theme()}
            options={READER_THEMES}
            value={settings.theme}
            labels={THEME_LABELS}
            onChange={(theme) => update({ theme })}
            renderOption={(theme, label) => (
              <span className="flex flex-col items-center gap-1 text-xs">
                {/* The preset's own colours: `data-reader-theme` scopes them to the swatch. */}
                <span
                  data-reader-theme={theme}
                  aria-hidden
                  className="flex size-11 items-center justify-center rounded-md border bg-reader-bg font-serif text-base text-reader-fg"
                >
                  Aa
                </span>
                {label}
              </span>
            )}
            className="grid grid-cols-3 gap-3"
          />
          <ChoiceGroup
            legend={m.reader_settings_font()}
            options={READER_FONTS}
            value={settings.font}
            labels={FONT_LABELS}
            onChange={(font) => update({ font })}
            className="grid grid-cols-2 gap-2"
          />
          <RangeField
            label={m.reader_settings_font_size()}
            range={READER_RANGES.fontSize}
            value={settings.fontSize}
            unit="px"
            onChange={(fontSize) => update({ fontSize })}
          />
          <RangeField
            label={m.reader_settings_line_height()}
            range={READER_RANGES.lineHeight}
            value={settings.lineHeight}
            onChange={(lineHeight) => update({ lineHeight })}
          />
          <RangeField
            label={m.reader_settings_paragraph_spacing()}
            range={READER_RANGES.paragraphSpacing}
            value={settings.paragraphSpacing}
            unit="em"
            onChange={(paragraphSpacing) => update({ paragraphSpacing })}
          />
          {/* The column is narrower than the screen only on desktop. */}
          <ChoiceGroup
            legend={m.reader_settings_width()}
            options={READER_WIDTHS}
            value={settings.width}
            labels={WIDTH_LABELS}
            onChange={(width) => update({ width })}
            className="grid grid-cols-3 gap-2"
            fieldsetClassName="hidden lg:flex"
          />
          <ChoiceGroup
            legend={m.reader_settings_align()}
            options={READER_ALIGNS}
            value={settings.align}
            labels={ALIGN_LABELS}
            onChange={(align) => update({ align })}
            className="grid grid-cols-2 gap-2"
          />
          <Button variant="outline" onClick={reset} className="self-start">
            {m.reader_settings_reset()}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** A row of radio buttons styled as segments; arrow keys move between them natively. */
function ChoiceGroup<T extends string>({
  legend,
  options,
  value,
  labels,
  onChange,
  renderOption,
  className,
  fieldsetClassName,
}: {
  legend: string;
  options: readonly T[];
  value: T | undefined;
  labels: Record<T, () => string>;
  onChange: (value: T) => void;
  renderOption?: (option: T, label: string) => ReactNode;
  className?: string;
  fieldsetClassName?: string;
}) {
  const name = useId();
  return (
    <fieldset className={cn('flex flex-col gap-2', fieldsetClassName)}>
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className={className}>
        {options.map((option) => {
          const label = labels[option]();
          return (
            <label key={option} className="cursor-pointer">
              <input
                type="radio"
                name={name}
                value={option}
                checked={value === option}
                onChange={() => onChange(option)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  'flex h-full items-center justify-center rounded-md border px-2 py-1.5 text-sm',
                  'peer-checked:border-primary peer-checked:ring-1 peer-checked:ring-primary',
                  'peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/70',
                )}
              >
                {renderOption ? renderOption(option, label) : label}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** A slider; values are rounded so float steps (0.1) never store `1.7000000000000002`. */
function RangeField({
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
        <label htmlFor={id} className="font-medium">
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
        className="w-full accent-primary"
      />
    </div>
  );
}
