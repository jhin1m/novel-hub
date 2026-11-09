import type { EditorDocJson, EditorNodeJson } from './doc-json';
import { generatePid } from './pid';

/**
 * A chapter document from plain text lines: every non-blank line becomes one paragraph with a
 * fresh pid; surrounding spaces are dropped. No lines at all gives one empty paragraph, like a new
 * draft. Used by the chapter import on both sides, so the browser preview counts words on exactly
 * the document the server will store.
 */
export function paragraphsToDoc(lines: readonly string[]): EditorDocJson {
  const content: EditorNodeJson[] = [];
  for (const line of lines) {
    const text = line.trim();
    if (!text) continue;
    content.push({
      type: 'paragraph',
      attrs: { pid: generatePid() },
      content: [{ type: 'text', text }],
    });
  }
  if (content.length === 0) content.push({ type: 'paragraph', attrs: { pid: generatePid() } });
  return { type: 'doc', content };
}
