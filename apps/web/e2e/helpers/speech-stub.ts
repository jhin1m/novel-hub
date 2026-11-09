import type { Page } from '@playwright/test';

export interface SpeechStubOptions {
  /** Lists a `vi-VN` voice (otherwise only an English one). */
  vietnamese: boolean;
  /**
   * Like iOS Safari: `speak()` fails with `not-allowed` until the page has been clicked (Chrome
   * keeps the activation of the previous page across a same-origin navigation, so it is not
   * used to test this). Off: the stub speaks whenever asked.
   */
  requireGesture?: boolean;
}

/** Controls of the fake engine, on `window.__tts` in the page. */
export interface SpeechStubControls {
  /** Every text passed to `speak()`, in order. */
  spoken: string[];
  /** Text being spoken, or `null`. */
  current(): string | null;
  /** Ends the utterance in flight, as if it was read to its end. */
  finish(): void;
  /** Ends utterances until one containing `text` is in flight (or nothing is left). */
  finishUntil(text: string): void;
  /** Ends every utterance until the queue stops asking for more. */
  finishAll(): void;
}

declare global {
  interface Window {
    __tts: SpeechStubControls;
  }
}

/**
 * Replaces `speechSynthesis` with a fake on every page `page` loads. Nothing is timed: an
 * utterance ends only when the test calls `window.__tts.finish()`, so no race with navigation.
 */
export async function stubSpeech(page: Page, options: SpeechStubOptions): Promise<void> {
  await page.addInitScript((opts: SpeechStubOptions) => {
    interface Utterance {
      text: string;
      onstart: (() => void) | null;
      onend: (() => void) | null;
      onerror: ((event: { error: string }) => void) | null;
    }
    const voices = [
      { name: 'English', lang: 'en-US', localService: true, default: true, voiceURI: 'en' },
      ...(opts.vietnamese
        ? [
            {
              name: 'Tiếng Việt',
              lang: 'vi-VN',
              localService: true,
              default: false,
              voiceURI: 'vi',
            },
          ]
        : []),
    ];
    let current: Utterance | null = null;
    const spoken: string[] = [];
    let clicked = false;
    // Capture phase on the window: runs before the page's own click handlers.
    window.addEventListener('click', () => (clicked = true), true);

    class FakeUtterance implements Utterance {
      text: string;
      rate = 1;
      lang = '';
      voice: unknown = null;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      constructor(text = '') {
        this.text = text;
      }
    }

    class FakeSynthesis extends EventTarget {
      getVoices() {
        return voices;
      }
      speak(utterance: Utterance) {
        spoken.push(utterance.text);
        if (opts.requireGesture && !clicked) {
          setTimeout(() => utterance.onerror?.({ error: 'not-allowed' }), 0);
          return;
        }
        current = utterance;
        setTimeout(() => utterance.onstart?.(), 0);
      }
      cancel() {
        const cancelled = current;
        current = null;
        if (cancelled) setTimeout(() => cancelled.onerror?.({ error: 'interrupted' }), 0);
      }
      pause() {}
      resume() {}
    }

    const finish = () => {
      const done = current;
      current = null;
      done?.onend?.();
    };
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: new FakeSynthesis(),
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      writable: true,
      value: FakeUtterance,
    });
    window.__tts = {
      spoken,
      current: () => current?.text ?? null,
      finish,
      finishUntil(text: string) {
        for (let i = 0; i < 1_000 && current && !current.text.includes(text); i++) finish();
      },
      finishAll() {
        for (let i = 0; i < 1_000 && current; i++) finish();
      },
    };
  }, options);
}
