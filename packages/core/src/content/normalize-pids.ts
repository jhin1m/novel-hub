import {
  type EditorDocJson,
  type EditorNodeJson,
  PID_NODE_TYPES,
  generatePid,
  isValidPid,
} from '@novel-hub/shared/editor';

const PID_TYPES: ReadonlySet<string> = new Set(PID_NODE_TYPES);

export interface NormalizedPids {
  doc: EditorDocJson;
  /** Pids in document order; becomes `chapter_contents.paragraph_ids`. */
  paragraphIds: string[];
  /** True when any pid was added or replaced, i.e. the stored draft must be updated too. */
  pidsChanged: boolean;
}

/**
 * The server is the authority on paragraph ids: every paragraph and heading (blockquotes included)
 * ends up with a valid pid that is unique in the chapter. Valid pids are kept so comments anchored
 * to a paragraph survive edits; missing, malformed and duplicate ones (copy-paste) get new ids.
 */
export function normalizePids(doc: EditorDocJson, gen: () => string = generatePid): NormalizedPids {
  const seen = new Set<string>();
  let pidsChanged = false;

  const freshPid = () => {
    for (;;) {
      const pid = gen();
      if (!seen.has(pid)) return pid;
    }
  };

  const visit = (node: EditorNodeJson): EditorNodeJson => {
    let next = node;
    if (PID_TYPES.has(node.type)) {
      const current = node.attrs?.pid;
      let pid: string;
      if (isValidPid(current) && !seen.has(current)) {
        pid = current;
      } else {
        pid = freshPid();
        pidsChanged = true;
        next = { ...node, attrs: { ...node.attrs, pid } };
      }
      seen.add(pid);
    }
    if (next.content) next = { ...next, content: next.content.map(visit) };
    return next;
  };

  const normalized = visit(doc) as EditorDocJson;
  return { doc: normalized, paragraphIds: [...seen], pidsChanged };
}
