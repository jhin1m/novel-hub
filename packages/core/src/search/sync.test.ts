import { describe, expect, it, vi } from 'vitest';
import { applySettled } from './sync';

type Row = { id: string; doc: { title: string } | null };

describe('applySettled', () => {
  it('re-applies when the row changed while it was being written', async () => {
    // Read as public, then a moderator hides it before the write lands.
    const reads: Row[][] = [[{ id: 's', doc: { title: 'A' } }], [{ id: 's', doc: null }]];
    const load = vi.fn(() => Promise.resolve(reads.shift() ?? [{ id: 's', doc: null }]));
    const apply = vi.fn<(rows: Row[]) => Promise<void>>(() => Promise.resolve());

    const final = await applySettled(load, apply);
    expect(apply.mock.calls.map(([rows]) => rows[0]?.doc)).toEqual([{ title: 'A' }, null]);
    expect(final).toEqual([{ id: 's', doc: null }]);
  });

  it('writes once when nothing changed', async () => {
    const apply = vi.fn<(rows: Row[]) => Promise<void>>(() => Promise.resolve());
    await applySettled(() => Promise.resolve([{ id: 's', doc: { title: 'A' } }]), apply);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('fails (so the job retries) when the row never settles', async () => {
    let n = 0;
    const load = () => Promise.resolve([{ id: 's', doc: { title: String((n += 1)) } }]);
    await expect(applySettled(load, () => Promise.resolve())).rejects.toThrow(/kept changing/);
  });
});
