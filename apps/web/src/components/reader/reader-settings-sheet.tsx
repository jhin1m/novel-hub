import {
  READER_ALIGNS,
  READER_RANGES,
  READER_WIDTHS,
  type ReaderAlign,
  type ReaderWidth,
} from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import type { RefObject } from 'react';
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
import { ChoiceGroup, FontChoices, RangeField, ThemeSwatches } from './reader-settings-controls';

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
 * Display settings panel: a bottom sheet on small screens, a right-hand panel from `lg` up. Modal
 * (focus trapped, page scroll locked, a click outside closes it) but over a transparent overlay,
 * so every change previews on the chapter text right away; on wide screens the route moves the
 * text column left so the panel never covers it (below ~1280px that also narrows the column, so a
 * wider column setting only shows once the panel closes). Opened from the reading controls
 * (`trigger`), which hold the open state.
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
  const panelFocus = usePanelTrigger(trigger, true);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="adaptive-right"
        overlayClassName="bg-transparent"
        className="gap-0 overflow-y-auto"
        {...panelFocus}
      >
        <SheetHeader className="pr-12">
          <SheetTitle className="text-lg font-extrabold">{m.reader_settings()}</SheetTitle>
          <SheetDescription>{m.reader_settings_description()}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-6 px-4 pb-6">
          <ThemeSwatches value={settings.theme} onChange={(theme) => update({ theme })} />
          <FontChoices value={settings.font} onChange={(font) => update({ font })} />
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
            variant="segment"
            className="grid grid-cols-3"
            fieldsetClassName="hidden lg:flex"
          />
          <ChoiceGroup
            legend={m.reader_settings_align()}
            options={READER_ALIGNS}
            value={settings.align}
            labels={ALIGN_LABELS}
            onChange={(align) => update({ align })}
            variant="segment"
            className="grid grid-cols-2"
          />
          <Button variant="outline" onClick={reset} className="w-full">
            {m.reader_settings_reset()}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
