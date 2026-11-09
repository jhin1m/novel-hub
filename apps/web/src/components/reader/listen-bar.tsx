import { m } from '@novel-hub/shared/messages';
import { PauseIcon, PlayIcon, XIcon } from 'lucide-react';
import { useId } from 'react';
import { LISTEN_RATES } from '@/lib/reader/tts/listen-storage';
import type { ChapterSpeech } from '@/lib/reader/tts/use-chapter-speech';
import { cn } from '@/lib/utils';

const PILL =
  'inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full text-sm font-semibold outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring [&_svg]:size-4 [&_svg]:shrink-0';

const RATE_FORMAT = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
/** `1.25` → `1,25×`: Vietnamese writes a decimal comma. */
const rateLabel = (rate: number) => m.reader_listen_rate_value({ rate: RATE_FORMAT.format(rate) });

/**
 * The listening player: play/pause, speed and stop, with a one-line status. A plain region over
 * the bottom of the page, not a dialog: the text stays readable and in place around it, and the
 * arrow keys still turn the chapter.
 */
export function ListenBar({ speech, onStop }: { speech: ChapterSpeech; onStop: () => void }) {
  const rateId = useId();
  const { state } = speech;
  const status =
    state === 'next'
      ? m.reader_listen_next()
      : state === 'ended'
        ? m.reader_listen_end()
        : state === 'blocked'
          ? m.reader_listen_tap_to_continue()
          : state === 'error'
            ? m.reader_listen_error()
            : null;
  const playing = state === 'playing' || state === 'next';

  return (
    <section
      aria-label={m.reader_listen_player()}
      className="fixed inset-x-3 bottom-[calc(80px+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-md flex-col gap-1 rounded-[20px] border border-reader-fg/10 bg-reader-card p-2 text-reader-fg shadow-lg lg:bottom-6"
    >
      <div className="flex items-center gap-2">
        {playing ? (
          <button
            type="button"
            onClick={speech.pause}
            disabled={state === 'next'}
            className={cn(
              PILL,
              'bg-reader-primary px-4 text-reader-primary-foreground disabled:opacity-60',
            )}
          >
            <PauseIcon />
            {m.reader_listen_pause()}
          </button>
        ) : (
          <button
            type="button"
            onClick={state === 'ended' ? speech.start : speech.resume}
            className={cn(PILL, 'bg-reader-primary px-4 text-reader-primary-foreground')}
          >
            <PlayIcon />
            {state === 'blocked' ? m.reader_listen_resume() : m.reader_listen_play()}
          </button>
        )}
        <label htmlFor={rateId} className="ml-1 text-[13px] text-reader-muted">
          {m.reader_listen_rate()}
        </label>
        <select
          id={rateId}
          value={speech.rate}
          onChange={(event) => speech.setRate(Number(event.target.value))}
          className={cn(PILL, 'border border-reader-fg/15 bg-reader-bg px-3')}
        >
          {LISTEN_RATES.map((rate) => (
            <option key={rate} value={rate}>
              {rateLabel(rate)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onStop}
          aria-label={m.reader_listen_stop()}
          className={cn(PILL, 'ml-auto w-10 hover:bg-reader-fg/5')}
        >
          <XIcon />
        </button>
      </div>
      {/* Always rendered: a live region added or shown with its text is often not announced. */}
      <p aria-live="polite" className="px-2 text-[13px]">
        {status}
      </p>
    </section>
  );
}
