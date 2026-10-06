import { m } from '@novel-hub/shared/messages';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { browserStorage } from '@/lib/draft-mirror';

const FOCUS_KEY = 'editor:focus';

function readFocus(): boolean {
  try {
    return browserStorage()?.getItem(FOCUS_KEY) === '1';
  } catch {
    return false;
  }
}

/** Focus mode, remembered on this device. `Esc` leaves it. */
export function useFocusMode() {
  const [focus, setFocus] = useState(readFocus);

  useEffect(() => {
    try {
      browserStorage()?.setItem(FOCUS_KEY, focus ? '1' : '0');
    } catch {
      // Storage disabled: the choice just is not remembered.
    }
    if (!focus) return;
    const onKey = (event: KeyboardEvent) => {
      // Esc while composing (Vietnamese IME) cancels the composition, not focus mode.
      if (event.key === 'Escape' && !event.isComposing) setFocus(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focus]);

  return [focus, setFocus] as const;
}

export function FocusToggle({
  focus,
  onChange,
}: {
  focus: boolean;
  onChange: (v: boolean) => void;
}) {
  const label = focus ? m.editor_focus_exit() : m.editor_focus_enter();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      onClick={() => onChange(!focus)}
      className={focus ? 'opacity-40 hover:opacity-100 focus-visible:opacity-100' : undefined}
    >
      {focus ? <Minimize2 /> : <Maximize2 />}
    </Button>
  );
}
