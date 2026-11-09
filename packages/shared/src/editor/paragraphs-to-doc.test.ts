import { describe, expect, it } from 'vitest';
import { countWords } from '../text';
import { docToText } from './doc-json';
import { parseEditorDoc } from './extensions';
import { paragraphsToDoc } from './paragraphs-to-doc';
import { isValidPid } from './pid';

describe('paragraphsToDoc', () => {
  it('makes one paragraph with a valid pid per non-blank line, trimmed', () => {
    const doc = paragraphsToDoc(['  Dòng một ', '', '   ', 'Dòng hai']);
    expect(doc.content).toHaveLength(2);
    expect(docToText(doc)).toBe('Dòng một\nDòng hai');
    const pids = (doc.content ?? []).map((node) => node.attrs?.pid);
    expect(pids.every(isValidPid)).toBe(true);
    expect(new Set(pids).size).toBe(2);
  });

  it('passes the editor schema check unchanged', () => {
    const doc = paragraphsToDoc(['Một', 'Hai']);
    const parsed = parseEditorDoc(doc);
    expect(parsed.ok && parsed.doc).toEqual(doc);
  });

  it('counts the words the server counts', () => {
    const doc = paragraphsToDoc(['Trời hôm nay đẹp quá.', '— Đi thôi! Anh ấy nói.']);
    expect(countWords(docToText(doc))).toBe(10);
  });

  it('has the text of its trimmed, non-blank lines joined by line breaks', () => {
    // The import preview counts words on that text instead of building the document.
    const lines = ['  Một hai ', '', 'Ba', ' \t ', 'Bốn — năm'];
    const expected = lines
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n');
    expect(docToText(paragraphsToDoc(lines))).toBe(expected);
    expect(docToText(paragraphsToDoc([]))).toBe('');
  });

  it('gives one empty paragraph when there is no text', () => {
    const doc = paragraphsToDoc(['', '  ']);
    expect(doc.content).toHaveLength(1);
    expect(doc.content?.[0]?.content).toBeUndefined();
    expect(parseEditorDoc(doc).ok).toBe(true);
  });
});
