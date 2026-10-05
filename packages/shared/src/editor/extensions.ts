import { type Extensions, getSchema } from '@tiptap/core';
import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { StarterKit } from '@tiptap/starter-kit';
import { UniqueID } from '@tiptap/extension-unique-id';
import type { EditorDocJson } from './doc-json';
import { generatePid, isValidPid } from './pid';

/** Node types that carry a stable `pid` (rendered as `data-pid`). */
export const PID_NODE_TYPES = ['paragraph', 'heading'] as const;
export const HEADING_LEVELS = [2, 3] as const;

/**
 * The one extension list for the chapter editor (browser) and for schema checks (server). The
 * allowed nodes and marks here are exactly what the publish renderer and sanitizer accept.
 */
export const editorExtensions: Extensions = [
  StarterKit.configure({
    heading: { levels: [...HEADING_LEVELS] },
    code: false,
    codeBlock: false,
    link: false,
    underline: false,
    bulletList: false,
    orderedList: false,
    listItem: false,
    listKeymap: false,
    trailingNode: false,
  }),
  UniqueID.configure({
    types: [...PID_NODE_TYPES],
    attributeName: 'pid',
    generateID: () => generatePid(),
  }),
];

export const editorSchema = getSchema(editorExtensions);

const PID_TYPES: ReadonlySet<string> = new Set(PID_NODE_TYPES);
const LEVELS: ReadonlySet<unknown> = new Set(HEADING_LEVELS);

/** Attribute values the schema itself does not validate. A missing pid is filled in on publish. */
function attrsValid(node: ProseMirrorNode): boolean {
  if (PID_TYPES.has(node.type.name)) {
    const pid: unknown = node.attrs.pid;
    if (pid !== null && !isValidPid(pid)) return false;
  }
  if (node.type.name === 'heading' && !LEVELS.has(node.attrs.level)) return false;
  return true;
}

export type ParsedEditorDoc =
  { ok: true; node: ProseMirrorNode; doc: EditorDocJson } | { ok: false };

/**
 * Checks untrusted document JSON against the editor schema. On success `doc` is the normalized
 * JSON (unknown attributes dropped) and is what gets stored.
 */
export function parseEditorDoc(json: unknown): ParsedEditorDoc {
  if (typeof json !== 'object' || json === null || !('type' in json) || json.type !== 'doc') {
    return { ok: false };
  }
  let node: ProseMirrorNode;
  try {
    node = ProseMirrorNode.fromJSON(editorSchema, json);
    node.check();
  } catch {
    return { ok: false };
  }
  let valid = true;
  node.descendants((child) => {
    if (valid && !attrsValid(child)) valid = false;
    return valid;
  });
  if (!valid) return { ok: false };
  return { ok: true, node, doc: node.toJSON() as EditorDocJson };
}

/** Starting content of a new chapter draft: one empty paragraph with a pid. */
export function emptyDraftDoc(): EditorDocJson {
  return { type: 'doc', content: [{ type: 'paragraph', attrs: { pid: generatePid() } }] };
}
