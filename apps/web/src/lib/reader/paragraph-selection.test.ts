import { describe, expect, it } from 'vitest';
import { type SelectionLike, type SelectionNode, pidFromSelection } from './paragraph-selection';

/** A tiny DOM: elements with attributes and children, text nodes as leaves. */
interface FakeNode extends SelectionNode {
  children: FakeNode[];
}

function el(attrs: Record<string, string>, children: FakeNode[] = []): FakeNode {
  const node: FakeNode = {
    nodeType: 1,
    parentNode: null,
    previousSibling: null,
    getAttribute: (name) => attrs[name] ?? null,
    children,
  };
  children.forEach((child, i) => {
    child.parentNode = node;
    child.previousSibling = children[i - 1] ?? null;
  });
  return node;
}

const text = (): FakeNode => ({
  nodeType: 3,
  parentNode: null,
  previousSibling: null,
  children: [],
});

function selection(
  start: SelectionNode,
  end: SelectionNode,
  { endOffset = 3, collapsed = false, ranges = 1, content = 'chữ' } = {},
): SelectionLike {
  return {
    isCollapsed: collapsed,
    rangeCount: ranges,
    getRangeAt: () => ({ startContainer: start, endContainer: end, endOffset }),
    toString: () => content,
  };
}

/** `<div root><h2 pid=hd…><p pid=p1…>a<strong>b</strong></p><blockquote><p pid=p2…>c</p></blockquote></div>` */
function chapter() {
  const headingText = text();
  const a = text();
  const b = text();
  const c = text();
  const heading = el({ 'data-pid': 'hd2k9xq2' }, [headingText]);
  const strong = el({}, [b]);
  const first = el({ 'data-pid': 'pa2k9xq2' }, [a, strong]);
  const quoted = el({ 'data-pid': 'pb2k9xq3' }, [c]);
  const quote = el({}, [quoted]);
  const root = el({ class: 'reader-content' }, [heading, first, quote]);
  const outside = text();
  el({}, [root, el({}, [outside])]);
  return { root, headingText, a, b, c, first, quoted, outside };
}

describe('pidFromSelection', () => {
  it('finds the paragraph or heading a selection lies in, through inline marks and quotes', () => {
    const { root, headingText, a, b, c } = chapter();
    expect(pidFromSelection(selection(a, b), root)).toBe('pa2k9xq2');
    expect(pidFromSelection(selection(headingText, headingText), root)).toBe('hd2k9xq2');
    expect(pidFromSelection(selection(c, c), root)).toBe('pb2k9xq3');
  });

  it('is null across two paragraphs, outside the text, collapsed, blank or multi-range', () => {
    const { root, a, c, outside } = chapter();
    expect(pidFromSelection(selection(a, c), root)).toBeNull();
    expect(pidFromSelection(selection(outside, outside), root)).toBeNull();
    expect(pidFromSelection(selection(a, outside), root)).toBeNull();
    expect(pidFromSelection(selection(a, a, { collapsed: true }), root)).toBeNull();
    expect(pidFromSelection(selection(a, a, { content: ' \n ' }), root)).toBeNull();
    expect(pidFromSelection(selection(a, a, { ranges: 2 }), root)).toBeNull();
    expect(pidFromSelection(null, root)).toBeNull();
    expect(pidFromSelection(selection(a, a), null)).toBeNull();
  });

  it('keeps a selection ending at the very start of the next paragraph (triple click)', () => {
    const { root, headingText, a, b, c, quoted } = chapter();
    expect(pidFromSelection(selection(a, c, { endOffset: 0 }), root)).toBe('pa2k9xq2');
    expect(pidFromSelection(selection(a, quoted, { endOffset: 0 }), root)).toBe('pa2k9xq2');
    expect(pidFromSelection(selection(headingText, a, { endOffset: 0 }), root)).toBe('hd2k9xq2');
    // Offset 0 of a later node of the next paragraph: some of that paragraph is selected.
    expect(pidFromSelection(selection(headingText, b, { endOffset: 0 }), root)).toBeNull();
  });

  it('ignores a pid that is not a valid paragraph id', () => {
    const t = text();
    const root = el({}, [el({ 'data-pid': 'x"]' }, [t])]);
    expect(pidFromSelection(selection(t, t), root)).toBeNull();
  });
});
