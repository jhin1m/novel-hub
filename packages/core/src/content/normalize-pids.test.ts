import type { EditorDocJson } from '@novel-hub/shared';
import { PID_PATTERN } from '@novel-hub/shared/editor';
import { describe, expect, it } from 'vitest';
import { normalizePids } from './normalize-pids';

const p = (pid: unknown) => ({ type: 'paragraph', attrs: { pid } });

function sequence(...ids: string[]) {
  let i = 0;
  return () => ids[i++] ?? 'zzzzzzzz';
}

describe('normalizePids', () => {
  it('keeps valid unique pids and leaves the document untouched', () => {
    const doc: EditorDocJson = {
      type: 'doc',
      content: [p('a2b3c4d5'), { type: 'heading', attrs: { level: 2, pid: 'a2b3c4d6' } }],
    };
    const result = normalizePids(doc);
    expect(result).toEqual({ doc, paragraphIds: ['a2b3c4d5', 'a2b3c4d6'], pidsChanged: false });
  });

  it('replaces missing, malformed and duplicate pids, inside blockquotes too', () => {
    const doc: EditorDocJson = {
      type: 'doc',
      content: [
        p('a2b3c4d5'),
        p('a2b3c4d5'),
        p('p1'),
        p(null),
        { type: 'blockquote', content: [p('a2b3c4d5')] },
        { type: 'horizontalRule' },
      ],
    };
    const result = normalizePids(doc, sequence('n2n2n2n2', 'n3n3n3n3', 'n4n4n4n4', 'n5n5n5n5'));
    expect(result.pidsChanged).toBe(true);
    expect(result.paragraphIds).toEqual([
      'a2b3c4d5',
      'n2n2n2n2',
      'n3n3n3n3',
      'n4n4n4n4',
      'n5n5n5n5',
    ]);
    expect(result.doc.content?.[4]?.content?.[0]?.attrs?.pid).toBe('n5n5n5n5');
    // The input is not mutated.
    expect(doc.content?.[1]?.attrs?.pid).toBe('a2b3c4d5');
  });

  it('never hands out a pid already used in the chapter', () => {
    const doc: EditorDocJson = { type: 'doc', content: [p('a2b3c4d5'), p(null)] };
    const result = normalizePids(doc, sequence('a2b3c4d5', 'n2n2n2n2'));
    expect(result.paragraphIds).toEqual(['a2b3c4d5', 'n2n2n2n2']);
  });

  it('generates pids in the editor format by default', () => {
    const result = normalizePids({ type: 'doc', content: [p(null)] });
    expect(result.paragraphIds[0]).toMatch(PID_PATTERN);
  });
});
