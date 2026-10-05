/**
 * JSON shape of a Tiptap/ProseMirror document as stored in `doc_json`. Plain types only, so code
 * that never loads Tiptap (seed, word count, duplicate check) can still read documents.
 */
export interface EditorMarkJson {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface EditorNodeJson {
  type: string;
  attrs?: Record<string, unknown>;
  content?: EditorNodeJson[];
  text?: string;
  marks?: EditorMarkJson[];
}

export interface EditorDocJson extends EditorNodeJson {
  type: 'doc';
}

function inlineText(node: EditorNodeJson): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  return (node.content ?? []).map(inlineText).join('');
}

/** Plain text of a document: one line per text block, hard breaks become line breaks. */
export function docToText(doc: EditorNodeJson): string {
  const lines: string[] = [];
  const walk = (node: EditorNodeJson) => {
    const children = node.content ?? [];
    // A block whose children are inline holds the text; containers (doc, blockquote) recurse.
    if (children.some((c) => c.type === 'text' || c.type === 'hardBreak')) {
      lines.push(inlineText(node));
      return;
    }
    children.forEach(walk);
  };
  walk(doc);
  return lines.join('\n');
}
