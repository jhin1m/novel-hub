import { describe, expect, it } from 'vitest';
import { type EditorDocJson, docToText } from './doc-json';

const text = (value: string) => ({ type: 'text', text: value });

describe('docToText', () => {
  it('joins text blocks with line breaks and turns hard breaks into line breaks', () => {
    const doc: EditorDocJson = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [text('Mở đầu')] },
        {
          type: 'paragraph',
          content: [text('Dòng một'), { type: 'hardBreak' }, text('dòng hai')],
        },
        { type: 'blockquote', content: [{ type: 'paragraph', content: [text('Trích')] }] },
      ],
    };
    expect(docToText(doc)).toBe('Mở đầu\nDòng một\ndòng hai\nTrích');
  });

  it('skips nodes without text', () => {
    const doc: EditorDocJson = {
      type: 'doc',
      content: [
        { type: 'paragraph' },
        { type: 'horizontalRule' },
        { type: 'paragraph', content: [text('Chữ')] },
      ],
    };
    expect(docToText(doc)).toBe('Chữ');
  });
});
