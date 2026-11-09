import { describe, expect, it, vi } from 'vitest';
import { createSpeechQueue, splitForSpeech } from './speech-queue';

interface FakeUtterance {
  text: string;
  rate: number;
  voice: SpeechSynthesisVoice | null;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
}

const VOICE = { lang: 'vi-VN', name: 'Việt', localService: true } as SpeechSynthesisVoice;

/** A speech engine driven by hand: an utterance ends only when the test says so. */
function setup() {
  let current: FakeUtterance | null = null;
  const spoken: string[] = [];
  const port = {
    speak: vi.fn((u: SpeechSynthesisUtterance) => {
      current = u as unknown as FakeUtterance;
      spoken.push(current.text);
    }),
    cancel: vi.fn(() => {
      const cancelled = current;
      current = null;
      cancelled?.onerror?.({ error: 'interrupted' });
    }),
  };
  const events = {
    onParagraph: vi.fn<(index: number) => void>(),
    onStart: vi.fn(),
    onEnd: vi.fn(),
    onError: vi.fn(),
  };
  const queue = createSpeechQueue(
    port,
    (text) =>
      ({
        text,
        rate: 1,
        voice: null,
        lang: '',
        onstart: null,
        onend: null,
        onerror: null,
      }) as FakeUtterance as unknown as SpeechSynthesisUtterance,
    events,
  );
  const engine = {
    get current() {
      return current;
    },
    finish() {
      const done = current;
      current = null;
      done?.onend?.();
    },
  };
  return { queue, port, events, engine, spoken };
}

describe('speech queue', () => {
  it('reads the paragraphs in order, one utterance at a time, then reports the end', () => {
    const { queue, events, engine, spoken } = setup();
    queue.play(['Một.', 'Hai.', 'Ba.'], { paragraph: 0, part: 0 }, { rate: 1.25, voice: VOICE });
    expect(engine.current).toMatchObject({ text: 'Một.', rate: 1.25, voice: VOICE, lang: 'vi-VN' });
    engine.current?.onstart?.();
    expect(events.onStart).toHaveBeenCalledOnce();
    engine.finish();
    engine.finish();
    expect(events.onEnd).not.toHaveBeenCalled();
    engine.finish();
    expect(spoken).toEqual(['Một.', 'Hai.', 'Ba.']);
    expect(events.onParagraph.mock.calls.map(([index]) => index)).toEqual([0, 1, 2]);
    expect(events.onEnd).toHaveBeenCalledOnce();
    expect(engine.current).toBeNull();
  });

  it('starts at the given paragraph and skips paragraphs with nothing to say', () => {
    const { queue, events, engine, spoken } = setup();
    queue.play(
      ['Một.', 'Hai.', '   ', 'Bốn.'],
      { paragraph: 1, part: 0 },
      { rate: 1, voice: VOICE },
    );
    engine.finish();
    engine.finish();
    expect(spoken).toEqual(['Hai.', 'Bốn.']);
    expect(events.onParagraph.mock.calls.map(([index]) => index)).toEqual([1, 3]);
    expect(events.onEnd).toHaveBeenCalledOnce();
  });

  it('stopping mid-way never reports the end nor the cancellation, and keeps the position', () => {
    const { queue, events, engine } = setup();
    queue.play(['Một.', 'Hai.', 'Ba.'], { paragraph: 0, part: 0 }, { rate: 1, voice: VOICE });
    engine.finish();
    queue.stop();
    expect(engine.current).toBeNull();
    expect(events.onEnd).not.toHaveBeenCalled();
    expect(events.onError).not.toHaveBeenCalled();
    expect(queue.position).toEqual({ paragraph: 1, part: 0 });
  });

  it('ignores callbacks of an utterance replaced by a new play', () => {
    const { queue, events, engine, spoken } = setup();
    queue.play(['Một.', 'Hai.'], { paragraph: 0, part: 0 }, { rate: 1, voice: VOICE });
    const old = engine.current;
    queue.play(['Một.', 'Hai.'], { paragraph: 1, part: 0 }, { rate: 2, voice: VOICE });
    old?.onend?.();
    old?.onerror?.({ error: 'synthesis-failed' });
    expect(spoken).toEqual(['Một.', 'Hai.']);
    expect(events.onError).not.toHaveBeenCalled();
    expect(events.onEnd).not.toHaveBeenCalled();
  });

  it('a cancellation from outside reads as interrupted; `not-allowed` means blocked', () => {
    for (const [error, expected] of [
      ['interrupted', 'interrupted'],
      ['canceled', 'interrupted'],
      ['not-allowed', 'blocked'],
      ['synthesis-failed', 'failed'],
    ] as const) {
      const { queue, events, engine } = setup();
      queue.play(['Một.'], { paragraph: 0, part: 0 }, { rate: 1, voice: VOICE });
      engine.current?.onerror?.({ error });
      expect(events.onError).toHaveBeenCalledWith(expected);
      // Nothing left in flight: a later end of that utterance changes nothing.
      engine.finish();
      expect(events.onEnd).not.toHaveBeenCalled();
    }
  });

  it('resumes part-way through a long paragraph without announcing it again', () => {
    const { queue, events, engine, spoken } = setup();
    const long = Array.from({ length: 6 }, (_, i) => `Câu thứ ${i} khá dài để chia ra nhiều phần.`);
    queue.play([long.join(' '), 'Hết.'], { paragraph: 0, part: 1 }, { rate: 1, voice: VOICE });
    expect(spoken).toHaveLength(1);
    expect(spoken[0]).not.toContain('Câu thứ 0');
    expect(events.onParagraph).toHaveBeenCalledTimes(1);
    while (engine.current) engine.finish();
    expect(spoken.at(-1)).toBe('Hết.');
    expect(events.onParagraph.mock.calls.map(([index]) => index)).toEqual([0, 1]);
  });
});

describe('splitForSpeech', () => {
  it('keeps short paragraphs whole and normalises spaces', () => {
    expect(splitForSpeech('  Hắn   nói:\n "Đi thôi!"  ')).toEqual(['Hắn nói: "Đi thôi!"']);
    expect(splitForSpeech('   ')).toEqual([]);
  });

  it('cuts at sentence ends, then commas, then words; no part exceeds the limit', () => {
    const text = 'Một hai ba. Bốn năm sáu! Bảy, tám, chín mười mười một mười hai mười ba';
    const parts = splitForSpeech(text, 20);
    expect(parts.every((part) => part.length <= 20)).toBe(true);
    expect(parts.join(' ')).toBe(text);
    expect(parts[0]).toBe('Một hai ba.');
  });
});
