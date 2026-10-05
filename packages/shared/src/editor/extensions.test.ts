import { describe, expect, it } from 'vitest';
import { docToText } from './doc-json';
import { emptyDraftDoc, parseEditorDoc } from './extensions';
import { PID_PATTERN } from './pid';

const PID = 'k7m2xq9p';
const paragraph = (text: string, marks?: { type: string; attrs?: object }[]) => ({
  type: 'paragraph',
  attrs: { pid: PID },
  content: [{ type: 'text', text, ...(marks ? { marks } : {}) }],
});

describe('parseEditorDoc', () => {
  it('accepts every allowed node and mark and returns normalized JSON', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2, pid: 'a2b3c4d5' },
          content: [{ type: 'text', text: 'Một' }],
        },
        paragraph('đậm', [{ type: 'bold' }, { type: 'italic' }, { type: 'strike' }]),
        { type: 'horizontalRule' },
        { type: 'blockquote', content: [paragraph('trích')] },
        {
          type: 'paragraph',
          attrs: { pid: null, unknown: 'x' },
          content: [
            { type: 'text', text: 'a' },
            { type: 'hardBreak' },
            { type: 'text', text: 'b' },
          ],
        },
      ],
    };
    const parsed = parseEditorDoc(doc);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(docToText(parsed.doc)).toBe('Một\nđậm\ntrích\na\nb');
    expect(JSON.stringify(parsed.doc)).not.toContain('unknown');
  });

  it('rejects marks and nodes outside the allowlist', () => {
    expect(
      parseEditorDoc({
        type: 'doc',
        content: [paragraph('x', [{ type: 'link', attrs: { href: 'https://a.b' } }])],
      }).ok,
    ).toBe(false);
    expect(
      parseEditorDoc({ type: 'doc', content: [{ type: 'image', attrs: { src: 'x' } }] }).ok,
    ).toBe(false);
    expect(
      parseEditorDoc({
        type: 'doc',
        content: [
          { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph('x')] }] },
        ],
      }).ok,
    ).toBe(false);
    expect(
      parseEditorDoc({
        type: 'doc',
        content: [{ type: 'heading', attrs: { level: 1 }, content: [] }],
      }).ok,
    ).toBe(false);
  });

  it('rejects invalid structure and bad pids', () => {
    expect(parseEditorDoc(null).ok).toBe(false);
    expect(parseEditorDoc('doc').ok).toBe(false);
    expect(parseEditorDoc({ type: 'paragraph' }).ok).toBe(false);
    expect(parseEditorDoc({ type: 'doc', content: [{ type: 'text', text: 'loose' }] }).ok).toBe(
      false,
    );
    expect(
      parseEditorDoc({ type: 'doc', content: [{ type: 'paragraph', attrs: { pid: 'p1' } }] }).ok,
    ).toBe(false);
  });
});

describe('emptyDraftDoc', () => {
  it('is a valid document with one empty paragraph that has a pid', () => {
    const doc = emptyDraftDoc();
    expect(parseEditorDoc(doc).ok).toBe(true);
    expect(doc.content?.[0]?.attrs?.pid).toMatch(PID_PATTERN);
  });
});
