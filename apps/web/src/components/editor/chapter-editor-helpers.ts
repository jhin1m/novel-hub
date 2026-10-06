import { countWords, docToText, type EditorDocJson } from '@novel-hub/shared';
import type { createMirrorWriter } from '@/lib/draft-mirror';

export const WORD_COUNT_DELAY_MS = 500;

export const wordsOf = (doc: EditorDocJson) => countWords(docToText(doc));

const pad2 = (n: number) => String(n).padStart(2, '0');

/** `HH:mm dd/MM` in local time, for short notices. */
export const shortDateTime = (date: Date) =>
  `${pad2(date.getHours())}:${pad2(date.getMinutes())} ${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}`;

export type MirrorWriter = ReturnType<typeof createMirrorWriter>;
