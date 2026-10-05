import { type EditorNodeJson, countWords, docToText } from '@novel-hub/shared';
import { type EditorDocJson, parseEditorDoc } from '@novel-hub/shared/editor';
import sanitizeHtml from 'sanitize-html';
import { describe, expect, it } from 'vitest';
import { renderChapterHtml, renderPublishedContent } from './render';
import { CHAPTER_SANITIZE } from './sanitize';
import { walkDocToHtml } from './walker';

const text = (value: string, marks?: string[]): EditorNodeJson => ({
  type: 'text',
  text: value,
  ...(marks ? { marks: marks.map((type) => ({ type })) } : {}),
});
const paragraph = (pid: string | null, ...content: EditorNodeJson[]): EditorNodeJson => ({
  type: 'paragraph',
  attrs: { pid },
  ...(content.length > 0 ? { content } : {}),
});

/** Every node and mark the editor allows, plus text that needs escaping. */
const FIXTURE = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2, pid: 'a2b3c4d5' }, content: [text('Mở đầu')] },
    { type: 'heading', attrs: { level: 3, pid: 'a2b3c4d6' }, content: [text('Phần một')] },
    paragraph(
      'k7m2xq9p',
      text('Chữ thường, '),
      text('đậm', ['bold']),
      text(' và '),
      text('tất cả', ['strike', 'italic', 'bold']),
      { type: 'hardBreak' },
      text(`& < > " ' <script>alert(1)</script> <img src=x onerror=alert(1)>`),
    ),
    paragraph('k7m2xq9q'),
    { type: 'horizontalRule' },
    { type: 'blockquote', content: [paragraph('k7m2xq9r', text('Trích dẫn', ['italic']))] },
  ],
};

function parsed(json: unknown): EditorDocJson {
  const result = parseEditorDoc(json);
  if (!result.ok) throw new Error('fixture does not match the editor schema');
  return result.doc;
}

describe('walkDocToHtml', () => {
  it('renders the allowlisted nodes with data-pid and a fixed mark order', () => {
    expect(walkDocToHtml(parsed(FIXTURE))).toBe(
      '<h2 data-pid="a2b3c4d5">Mở đầu</h2>' +
        '<h3 data-pid="a2b3c4d6">Phần một</h3>' +
        '<p data-pid="k7m2xq9p">Chữ thường, <strong>đậm</strong> và ' +
        '<strong><em><s>tất cả</s></em></strong><br />' +
        `&amp; &lt; &gt; " ' &lt;script&gt;alert(1)&lt;/script&gt; ` +
        '&lt;img src=x onerror=alert(1)&gt;</p>' +
        '<p data-pid="k7m2xq9q"></p>' +
        '<hr />' +
        '<blockquote><p data-pid="k7m2xq9r"><em>Trích dẫn</em></p></blockquote>',
    );
  });

  it('is already in sanitized form, byte for byte', () => {
    const html = walkDocToHtml(parsed(FIXTURE));
    expect(sanitizeHtml(html, CHAPTER_SANITIZE)).toBe(html);
  });

  it('clamps heading levels to h2/h3 and refuses nodes outside the allowlist', () => {
    const doc = { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 } }] };
    expect(walkDocToHtml(doc)).toBe('<h2></h2>');
    expect(() => walkDocToHtml({ type: 'doc', content: [{ type: 'image' }] })).toThrow();
    expect(() =>
      walkDocToHtml({ type: 'doc', content: [paragraph('k7m2xq9p', text('x', ['link']))] }),
    ).toThrow();
  });
});

describe('renderChapterHtml', () => {
  it('drops anything the sanitizer does not allow', () => {
    const html = renderChapterHtml(parsed(FIXTURE));
    expect(html).not.toMatch(/<(script|img)/);
    expect(html.match(/<(p|h2|h3)\b/g)?.length).toBe(html.match(/data-pid=/g)?.length);
  });
});

describe('renderPublishedContent', () => {
  it('returns html, paragraph ids in order, word count and hash', () => {
    const result = renderPublishedContent(FIXTURE);
    if (!result.ok) throw new Error(result.error);
    const { value } = result;
    expect(value.paragraphIds).toEqual([
      'a2b3c4d5',
      'a2b3c4d6',
      'k7m2xq9p',
      'k7m2xq9q',
      'k7m2xq9r',
    ]);
    expect(value.pidsChanged).toBe(false);
    expect(value.wordCount).toBe(countWords(docToText(value.doc)));
    expect(value.contentHash).toMatch(/^[0-9a-f]{64}$/);
    const again = renderPublishedContent(FIXTURE);
    expect(again.ok && again.value.contentHash).toBe(value.contentHash);
  });

  it('fills missing pids and reports the change', () => {
    const result = renderPublishedContent({
      type: 'doc',
      content: [paragraph(null, text('Một')), paragraph('k7m2xq9p', text('Hai'))],
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.value.pidsChanged).toBe(true);
    expect(result.value.paragraphIds).toHaveLength(2);
    expect(result.value.html).toContain(`data-pid="${result.value.paragraphIds[0]}"`);
  });

  it('rejects documents outside the editor schema', () => {
    expect(renderPublishedContent({ type: 'doc', content: [{ type: 'image' }] })).toEqual({
      ok: false,
      error: 'INVALID_DOCUMENT',
    });
    expect(renderPublishedContent('<p>html</p>')).toEqual({
      ok: false,
      error: 'INVALID_DOCUMENT',
    });
  });
});
