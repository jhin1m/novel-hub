import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { listenHandoff, readListenRate, saveListenRate } from './listen-storage';
import { bringIntoView, firstVisible, isFollowing, paragraphElements } from './paragraph-view';
import { type SpeechPosition, type SpeechQueue, createSpeechQueue } from './speech-queue';
import { pickVietnameseVoice, waitForVoices } from './vietnamese-voice';

/**
 * `paused` also covers speech cut from outside the page. `next`: leaving for the next chapter.
 * `blocked`: the browser refused to start without a tap. `ended`: the last published chapter was
 * read to its end.
 */
export type SpeechState = 'idle' | 'playing' | 'paused' | 'blocked' | 'error' | 'next' | 'ended';

/** Without `onstart` this long after an automatic start, the browser is taken to have refused. */
const AUTOSTART_TIMEOUT_MS = 1500;

export interface ChapterSpeech {
  /** The browser can speak, has a Vietnamese voice, and the text is not behind the 18+ screen. */
  supported: boolean;
  state: SpeechState;
  rate: number;
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  setRate: (rate: number) => void;
}

interface Options {
  publicId: string;
  number: number;
  next: { number: number; href: string } | null;
  /** Off while the 18+ screen hides the text: anything playing stops. */
  enabled: boolean;
}

/**
 * Reads the chapter text aloud: marks the paragraph being read (`data-tts-active`), goes on to
 * the next chapter at the end. All client side: the page HTML stays the same for everyone.
 */
export function useChapterSpeech(
  content: RefObject<HTMLElement | null>,
  options: Options,
): ChapterSpeech {
  const { publicId, number, enabled } = options;
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<SpeechState>('idle');
  // Read on the server too (it falls back to the default there): the player is never server-rendered.
  const [rate, setRateState] = useState(readListenRate);
  const latest = useRef({ options, rate });
  useEffect(() => {
    latest.current = { options, rate };
  });
  const voice = useRef<SpeechSynthesisVoice | null>(null);
  const queue = useRef<SpeechQueue | null>(null);
  const elements = useRef<HTMLElement[]>([]);
  const marked = useRef<HTMLElement | null>(null);
  // Set by a tap on play: the next paragraph is brought into view even if the reader looked away.
  const follow = useRef(false);
  // An automatic start (from the previous chapter) waits for `onstart`; any tap supersedes it.
  const autostart = useRef<{ started: boolean } | null>(null);
  const handoffTaken = useRef<string | null>(null);

  const mark = useCallback((element: HTMLElement | null) => {
    marked.current?.removeAttribute('data-tts-active');
    marked.current = element;
    element?.setAttribute('data-tts-active', '');
  }, []);

  const getQueue = useCallback((): SpeechQueue => {
    queue.current ??= createSpeechQueue(
      window.speechSynthesis,
      (text) => new SpeechSynthesisUtterance(text),
      {
        onParagraph: (index) => {
          const element = elements.current[index] ?? null;
          // A reader who scrolled away from the text being read is left where they are.
          const scroll = follow.current || isFollowing(marked.current);
          follow.current = false;
          mark(element);
          if (element && scroll) bringIntoView(element);
        },
        onStart: () => {
          if (autostart.current) autostart.current.started = true;
        },
        onEnd: () => {
          mark(null);
          const { options: current, rate: currentRate } = latest.current;
          if (!current.next) {
            setState('ended');
            return;
          }
          setState('next');
          listenHandoff.set(current.publicId, current.next.number, { rate: currentRate });
          window.location.assign(current.next.href);
        },
        onError: (kind) =>
          setState(kind === 'blocked' ? 'blocked' : kind === 'interrupted' ? 'paused' : 'error'),
      },
    );
    return queue.current;
  }, [mark]);

  const playFrom = useCallback(
    (from: SpeechPosition | 'visible', speed: number) => {
      if (!voice.current) return;
      elements.current = paragraphElements(content.current);
      const position =
        from === 'visible' ? { paragraph: firstVisible(elements.current), part: 0 } : from;
      setRateState(speed);
      setState('playing');
      follow.current = true;
      getQueue().play(
        elements.current.map((element) => element.textContent ?? ''),
        position,
        { rate: speed, voice: voice.current },
      );
    },
    [content, getQueue],
  );

  const halt = useCallback(() => {
    autostart.current = null;
    queue.current?.stop();
  }, []);

  // Support is known only in the browser, once the voices have loaded.
  useEffect(() => {
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return;
    let cancelled = false;
    void waitForVoices(window.speechSynthesis).then((voices) => {
      if (cancelled) return;
      voice.current = pickVietnameseVoice(voices);
      setSupported(voice.current !== null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Arriving from the end of the previous chapter: carry on reading, if the browser lets us.
  useEffect(() => {
    if (!supported || !enabled) return;
    const key = `${publicId}/${number}`;
    // Taken once: development StrictMode runs effects twice, and taking removes the handoff.
    if (handoffTaken.current === key) return;
    handoffTaken.current = key;
    const handoff = listenHandoff.take(publicId, number);
    if (!handoff) return;
    const attempt = { started: false };
    autostart.current = attempt;
    playFrom({ paragraph: 0, part: 0 }, handoff.rate);
    // Not cleared on effect cleanup: it must outlive StrictMode's second run. It only acts on
    // its own attempt, so a tap meanwhile (which clears `autostart`) wins.
    setTimeout(() => {
      if (autostart.current !== attempt || attempt.started) return;
      halt();
      setState((current) => (current === 'playing' ? 'blocked' : current));
    }, AUTOSTART_TIMEOUT_MS);
  }, [supported, enabled, publicId, number, playFrom, halt]);

  // Nothing keeps talking behind the 18+ screen: the player closes during render, the speech and
  // the mark go in the effect.
  const [wasEnabled, setWasEnabled] = useState(enabled);
  if (wasEnabled !== enabled) {
    setWasEnabled(enabled);
    if (!enabled) setState('idle');
  }
  useEffect(() => {
    if (enabled) return;
    halt();
    mark(null);
  }, [enabled, halt, mark]);

  // Nor once the page is left or gone. Back on it from the back/forward cache, the player no
  // longer claims to be leaving.
  useEffect(() => {
    const onPageHide = () => {
      halt();
      setState((current) => (current === 'playing' ? 'paused' : current));
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setState((current) => (current === 'next' ? 'idle' : current));
    };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      halt();
      mark(null);
    };
  }, [halt, mark]);

  return {
    supported: supported && enabled,
    state,
    rate,
    start: () => {
      autostart.current = null;
      playFrom('visible', rate);
    },
    pause: () => {
      halt();
      setState('paused');
    },
    resume: () => {
      autostart.current = null;
      playFrom(queue.current?.position ?? 'visible', rate);
    },
    stop: () => {
      halt();
      mark(null);
      // Stopped while the next chapter loads: it must not start reading.
      if (state === 'next' && options.next) listenHandoff.take(publicId, options.next.number);
      setState('idle');
    },
    setRate: (next: number) => {
      setRateState(next);
      saveListenRate(next);
      // The new speed applies from the part being read.
      if (state === 'playing' && queue.current) {
        autostart.current = null;
        playFrom(queue.current.position, next);
      }
    },
  };
}
