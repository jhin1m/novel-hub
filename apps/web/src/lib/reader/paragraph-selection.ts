import { isValidPid } from '@novel-hub/shared';

/*
 * The DOM parts the lookup walks, so it runs on real selections and on the small fakes of its
 * unit test alike. A real `Selection` and its nodes satisfy these.
 */
export interface SelectionNode {
  nodeType: number;
  parentNode: SelectionNode | null;
  previousSibling: SelectionNode | null;
  getAttribute?: (name: string) => string | null;
}

export interface SelectionLike {
  isCollapsed: boolean;
  rangeCount: number;
  getRangeAt: (index: number) => {
    startContainer: SelectionNode;
    endContainer: SelectionNode;
    endOffset: number;
  };
  toString: () => string;
}

const ELEMENT_NODE = 1;

/**
 * The nearest element at or above `node` carrying `data-pid`, as long as it sits inside `root`
 * (the chapter text). `null` when the node is outside `root` or in no paragraph.
 */
function paragraphOf(node: SelectionNode, root: SelectionNode): SelectionNode | null {
  let found: SelectionNode | null = null;
  for (let at: SelectionNode | null = node; at; at = at.parentNode) {
    if (at === root) return found;
    if (
      !found &&
      at.nodeType === ELEMENT_NODE &&
      typeof at.getAttribute?.('data-pid') === 'string'
    ) {
      found = at;
    }
  }
  return null;
}

/** Whether `node` is where `element` starts: the first child at every level down to it. */
function startsElement(node: SelectionNode, element: SelectionNode): boolean {
  for (let at: SelectionNode | null = node; at && at !== element; at = at.parentNode) {
    if (at.previousSibling) return false;
  }
  return true;
}

/**
 * The `data-pid` of the one paragraph (or heading) of `root` the selection lies in, or `null`
 * when nothing is selected, only blanks are, or it spans several paragraphs or leaves the text.
 * A selection ending at the very start of the next paragraph (what a triple click gives) still
 * counts as the first one's.
 */
export function pidFromSelection(
  selection: SelectionLike | null,
  root: SelectionNode | null,
): string | null {
  if (!selection || !root || selection.isCollapsed || selection.rangeCount !== 1) return null;
  if (selection.toString().trim() === '') return null;
  const range = selection.getRangeAt(0);
  const start = paragraphOf(range.startContainer, root);
  if (!start) return null;
  if (start !== paragraphOf(range.endContainer, root)) {
    const end = paragraphOf(range.endContainer, root);
    if (!end || range.endOffset !== 0 || !startsElement(range.endContainer, end)) return null;
  }
  const pid = start.getAttribute?.('data-pid');
  return isValidPid(pid) ? pid : null;
}
