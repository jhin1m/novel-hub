/**
 * Reads a chapter aloud paragraph by paragraph through the browser's speech synthesis. Each
 * paragraph is cut into short utterances: Chrome stops a long one after about 15 seconds, and
 * queueing the next one from `onend` keeps a single utterance in flight. No React here.
 */

/** The part of `window.speechSynthesis` the queue needs. */
export interface SpeechPort {
  speak(utterance: SpeechSynthesisUtterance): void;
  cancel(): void;
}

export interface SpeechQueueEvents {
  /** Paragraph `index` starts (also when a paragraph is resumed part-way). */
  onParagraph(index: number): void;
  /** The engine actually started speaking an utterance. */
  onStart(): void;
  /** The last paragraph was read to its end. */
  onEnd(): void;
  /**
   * `blocked`: the browser wants a user gesture first. `interrupted`: something outside the page
   * cut the speech (another tab speaking, a call). `failed`: anything else.
   */
  onError(kind: 'blocked' | 'interrupted' | 'failed'): void;
}

export interface SpeechPosition {
  paragraph: number;
  /** Utterance within the paragraph. */
  part: number;
}

/** Longest utterance, in characters: roughly ten seconds of speech at normal rate. */
const MAX_PART = 220;

/**
 * Splits a paragraph into utterances of at most `max` characters, at sentence ends first, then at
 * commas or spaces. Never returns an empty part.
 */
export function splitForSpeech(text: string, max = MAX_PART): string[] {
  const sentences =
    text
      .replace(/\s+/g, ' ')
      .trim()
      .match(/[^.!?…]+(?:[.!?…]+["”’)]*|$)/g) ?? [];
  const parts: string[] = [];
  let current = '';
  const push = (piece: string) => {
    if (!current) current = piece;
    else if (current.length + 1 + piece.length <= max) current += ` ${piece}`;
    else {
      parts.push(current);
      current = piece;
    }
  };
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (sentence.length <= max) {
      push(sentence);
      continue;
    }
    // A sentence too long on its own: cut after commas, then between words.
    // No lookbehind: Safari before 16.4 rejects it.
    for (const raw of sentence.match(/[^,;:]+[,;:]*/g) ?? []) {
      const clause = raw.trim();
      if (!clause) continue;
      if (clause.length <= max) {
        push(clause);
        continue;
      }
      for (const word of clause.split(' ')) {
        // A single word longer than `max` (a URL, say) goes out as is.
        push(word);
      }
    }
  }
  if (current) parts.push(current);
  return parts;
}

/** Errors a cancellation fires: the queue's own (ignored) or one from outside the page. */
const CANCELLED = new Set(['interrupted', 'canceled']);

export function createSpeechQueue(
  port: SpeechPort,
  makeUtterance: (text: string) => SpeechSynthesisUtterance,
  events: SpeechQueueEvents,
) {
  let paragraphs: string[][] = [];
  let position: SpeechPosition = { paragraph: 0, part: 0 };
  let options: { rate: number; voice: SpeechSynthesisVoice } | null = null;
  // Bumped by every play/stop, so callbacks of an older utterance are ignored.
  let generation = 0;
  // Holds the utterance in flight: once garbage collected, some engines never fire `onend`.
  let current: SpeechSynthesisUtterance | null = null;

  const speakAt = (run: number, paragraph: number, part: number) => {
    // Skips paragraphs with nothing to say (an empty line, a lone `* * *` reads as nothing).
    while (paragraph < paragraphs.length && part >= (paragraphs[paragraph]?.length ?? 0)) {
      paragraph += 1;
      part = 0;
    }
    if (paragraph >= paragraphs.length) {
      current = null;
      events.onEnd();
      return;
    }
    const entered = paragraph !== position.paragraph;
    position = { paragraph, part };
    if (entered) events.onParagraph(paragraph);
    // The listener may have stopped or restarted the queue meanwhile.
    if (run !== generation || !options) return;
    const utterance = makeUtterance(paragraphs[paragraph]?.[part] ?? '');
    utterance.rate = options.rate;
    utterance.voice = options.voice;
    utterance.lang = options.voice.lang;
    utterance.onstart = () => {
      if (run === generation) events.onStart();
    };
    utterance.onend = () => {
      if (run !== generation || current !== utterance) return;
      speakAt(run, paragraph, part + 1);
    };
    utterance.onerror = (event) => {
      // The queue bumps `generation` before cancelling itself, so a cancellation that gets past
      // this check came from outside.
      if (run !== generation || current !== utterance) return;
      current = null;
      events.onError(
        event.error === 'not-allowed'
          ? 'blocked'
          : CANCELLED.has(event.error)
            ? 'interrupted'
            : 'failed',
      );
    };
    current = utterance;
    port.speak(utterance);
  };

  return {
    /** Starts reading `texts` (one per paragraph) at `from`, after stopping anything in flight. */
    play(
      texts: string[],
      from: SpeechPosition,
      opts: { rate: number; voice: SpeechSynthesisVoice },
    ): void {
      generation += 1;
      current = null;
      port.cancel();
      paragraphs = texts.map((text) => splitForSpeech(text));
      options = opts;
      position = { paragraph: -1, part: 0 };
      speakAt(generation, Math.max(0, from.paragraph), Math.max(0, from.part));
    },

    /** Silences the speech; `position` keeps where it stopped. Never reports the cancellation. */
    stop(): void {
      generation += 1;
      current = null;
      port.cancel();
    },

    /** Where reading is, or stopped. */
    get position(): SpeechPosition {
      return position;
    },
  };
}

export type SpeechQueue = ReturnType<typeof createSpeechQueue>;
