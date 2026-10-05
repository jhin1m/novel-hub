import type { EditorMarkJson, EditorNodeJson } from '@novel-hub/shared';

/**
 * Marks in the order they are nested, outermost first. Fixed here (not taken from the JSON) so the
 * same document always renders to the same bytes, whatever order the marks were stored in.
 */
const MARK_TAGS = [
  ['bold', 'strong'],
  ['italic', 'em'],
  ['strike', 's'],
] as const;

const KNOWN_MARKS: ReadonlySet<string> = new Set(MARK_TAGS.map(([type]) => type));

/** Same escaping as `sanitize-html` applies to text, so sanitizing the output changes nothing. */
function escapeText(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/** Pids are validated by the editor schema; escaping still keeps an attribute from breaking out. */
function escapeAttr(value: string): string {
  return escapeText(value).replaceAll('"', '&quot;');
}

function pidAttr(node: EditorNodeJson): string {
  const pid = node.attrs?.pid;
  return typeof pid === 'string' ? ` data-pid="${escapeAttr(pid)}"` : '';
}

function renderText(text: string, marks: readonly EditorMarkJson[] = []): string {
  for (const mark of marks) {
    if (!KNOWN_MARKS.has(mark.type)) throw new Error(`Unexpected mark "${mark.type}"`);
  }
  const present = new Set(marks.map((mark) => mark.type));
  let html = escapeText(text);
  for (const [type, tag] of [...MARK_TAGS].reverse()) {
    if (present.has(type)) html = `<${tag}>${html}</${tag}>`;
  }
  return html;
}

function renderChildren(node: EditorNodeJson): string {
  return (node.content ?? []).map(renderNode).join('');
}

/** Levels outside the editor's [2, 3] are clamped, so a chapter never gets a second `<h1>`. */
function headingTag(node: EditorNodeJson): 'h2' | 'h3' {
  return node.attrs?.level === 3 ? 'h3' : 'h2';
}

function renderNode(node: EditorNodeJson): string {
  switch (node.type) {
    case 'doc':
      return renderChildren(node);
    case 'paragraph':
      return `<p${pidAttr(node)}>${renderChildren(node)}</p>`;
    case 'heading': {
      const tag = headingTag(node);
      return `<${tag}${pidAttr(node)}>${renderChildren(node)}</${tag}>`;
    }
    case 'blockquote':
      return `<blockquote>${renderChildren(node)}</blockquote>`;
    case 'horizontalRule':
      return '<hr />';
    case 'hardBreak':
      return '<br />';
    case 'text':
      return renderText(node.text ?? '', node.marks);
    default:
      // Documents reach the walker only after `parseEditorDoc`, so this is a programming error.
      throw new Error(`Unexpected node "${node.type}"`);
  }
}

/**
 * Chapter document JSON → HTML for the allowlisted nodes and marks. Output is deterministic and
 * already in the exact form `sanitize-html` prints, so sanitizing it is a no-op (tested).
 */
export function walkDocToHtml(doc: EditorNodeJson): string {
  return renderNode(doc);
}
