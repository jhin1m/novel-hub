import { countWords, docToText, type EditorDocJson } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import type { createMirrorWriter } from '@/lib/draft-mirror';

export const WORD_COUNT_DELAY_MS = 500;

export const wordsOf = (doc: EditorDocJson) => countWords(docToText(doc));

const pad2 = (n: number) => String(n).padStart(2, '0');

/** `HH:mm dd/MM` in local time, for short notices. */
export const shortDateTime = (date: Date) =>
  `${pad2(date.getHours())}:${pad2(date.getMinutes())} ${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}`;

export type MirrorWriter = ReturnType<typeof createMirrorWriter>;

/** Where the editor switches to its desktop layout (Tailwind `md`). */
export const DESKTOP_QUERY = '(min-width: 768px)';

/** "2.840 chữ" */
export const wordCountText = (words: number) =>
  m.editor_word_count({ count: words.toLocaleString('vi-VN') });

/*
 * Room kept around the caret when the editor scrolls it into view: the sticky header and floating
 * toolbar cover the top on desktop, the bottom toolbar covers the bottom on a phone.
 */
const CARET_MARGIN = { top: 150, bottom: 80, left: 0, right: 0 };

/** ProseMirror props of the chapter editor: a labelled multiline textbox. */
export const chapterEditorProps = () => ({
  attributes: {
    class: 'chapter-editor-content',
    'aria-label': m.editor_content_label(),
    'aria-multiline': 'true',
    role: 'textbox',
  },
  scrollMargin: CARET_MARGIN,
  scrollThreshold: CARET_MARGIN,
});
