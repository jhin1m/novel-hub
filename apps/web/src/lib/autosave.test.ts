import type { EditorDocJson } from '@novel-hub/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type AutosaveOptions,
  type SaveOutcome,
  type SaveStatus,
  createAutosave,
} from './autosave';

const doc = (text: string): EditorDocJson => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

function setup(outcomes: (SaveOutcome | Promise<SaveOutcome>)[] = []) {
  const statuses: SaveStatus[] = [];
  let version = 0;
  const save = vi.fn<AutosaveOptions['save']>(() => {
    const next = outcomes.shift();
    if (next) return Promise.resolve(next);
    version += 1;
    return Promise.resolve<SaveOutcome>({ ok: true, updatedAt: `v${version}` });
  });
  const autosave = createAutosave({
    save,
    initialBase: 'v0',
    initialJson: JSON.stringify(doc('')),
    onStatus: (s) => statuses.push(s),
  });
  return { autosave, save, statuses, last: () => statuses.at(-1)?.kind };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createAutosave', () => {
  it('collapses several edits within the debounce into one save', async () => {
    const { autosave, save, last } = setup();
    autosave.change(() => doc('a'));
    await vi.advanceTimersByTimeAsync(1_000);
    autosave.change(() => doc('ab'));
    await vi.advanceTimersByTimeAsync(1_000);
    autosave.change(() => doc('abc'));
    expect(last()).toBe('dirty');
    await vi.advanceTimersByTimeAsync(2_000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0]).toEqual(doc('abc'));
    expect(save.mock.calls[0]?.[1]).toBe('v0');
    expect(last()).toBe('saved');
  });

  it('saves after maxWait while edits keep coming', async () => {
    const { autosave, save } = setup();
    for (let t = 0; t < 12_000; t += 500) {
      autosave.change(() => doc(`t${t}`));
      await vi.advanceTimersByTimeAsync(500);
      if (t < 9_500) expect(save).not.toHaveBeenCalled();
    }
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('saves once more after a request when edits arrive during it, on the new base', async () => {
    let resolve: (o: SaveOutcome) => void = () => undefined;
    const { autosave, save, last } = setup([
      new Promise<SaveOutcome>((r) => {
        resolve = r;
      }),
    ]);
    autosave.change(() => doc('a'));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(last()).toBe('saving');
    autosave.change(() => doc('ab'));
    autosave.change(() => doc('abc'));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(save).toHaveBeenCalledTimes(1);
    resolve({ ok: true, updatedAt: 'v1' });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]?.[0]).toEqual(doc('abc'));
    expect(save.mock.calls[1]?.[1]).toBe('v1');
  });

  it('does not save a document identical to the last saved one', async () => {
    const { autosave, save, last } = setup();
    autosave.change(() => doc(''));
    await vi.advanceTimersByTimeAsync(3_000);
    expect(save).not.toHaveBeenCalled();
    expect(last()).toBe('saved');
  });

  it('retries retryable errors with growing delays', async () => {
    const retryable: SaveOutcome = { ok: false, kind: 'retryable' };
    const { autosave, save, statuses } = setup([
      retryable,
      retryable,
      retryable,
      retryable,
      retryable,
      retryable,
    ]);
    autosave.change(() => doc('a'));
    await vi.advanceTimersByTimeAsync(2_000);
    const delays: (number | null)[] = [];
    for (const wait of [2_000, 4_000, 8_000, 16_000, 30_000, 30_000]) {
      const status = statuses.at(-1);
      if (status?.kind === 'error') delays.push(status.retryInMs);
      await vi.advanceTimersByTimeAsync(wait);
    }
    expect(delays).toEqual([2_000, 4_000, 8_000, 16_000, 30_000, 30_000]);
    expect(save).toHaveBeenCalledTimes(7);
    expect(statuses.at(-1)?.kind).toBe('saved');
  });

  it('treats a thrown save (network failure) as retryable', async () => {
    const { autosave, save, statuses } = setup();
    save.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    autosave.change(() => doc('a'));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(statuses.at(-1)).toEqual({ kind: 'error', retryInMs: 2_000 });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(statuses.at(-1)?.kind).toBe('saved');
  });

  it('stops on a conflict until rebased, then saves the kept document', async () => {
    const { autosave, save, last } = setup([{ ok: false, kind: 'conflict' }]);
    autosave.change(() => doc('mine'));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(last()).toBe('conflict');
    autosave.change(() => doc('mine 2'));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(save).toHaveBeenCalledTimes(1);

    autosave.rebase('v9', JSON.stringify(doc('theirs')));
    await autosave.flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]?.[0]).toEqual(doc('mine 2'));
    expect(save.mock.calls[1]?.[1]).toBe('v9');
    expect(last()).toBe('saved');
  });

  it('stops on a fatal error without retrying', async () => {
    const { autosave, save, statuses } = setup([{ ok: false, kind: 'fatal' }]);
    autosave.change(() => doc('a'));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(statuses.at(-1)).toEqual({ kind: 'error', retryInMs: null });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('pause() flushes once, ignores edits until resume(), then saves after the debounce', async () => {
    const { autosave, save } = setup();
    autosave.change(() => doc('a'));
    const status = await autosave.pause();
    expect(status.kind).toBe('saved');
    expect(save).toHaveBeenCalledTimes(1);

    autosave.change(() => doc('ab'));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(autosave.hasPendingChanges()).toBe(true);

    autosave.resume();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(autosave.getBase()).toBe('v2');
  });

  it('pause() reports an error when the flush fails and does not schedule a retry', async () => {
    const { autosave, save } = setup([{ ok: false, kind: 'retryable' }]);
    autosave.change(() => doc('a'));
    const status = await autosave.pause();
    expect(status.kind).toBe('error');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('returns to saved when edits are undone back to the saved document after an error', async () => {
    const { autosave, save, statuses } = setup([{ ok: false, kind: 'retryable' }]);
    autosave.change(() => doc('a'));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(statuses.at(-1)?.kind).toBe('error');
    autosave.change(() => doc(''));
    expect((await autosave.pause()).kind).toBe('saved');
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('handles a save that throws synchronously like a failed request', async () => {
    const { autosave, save, statuses } = setup();
    save.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    autosave.change(() => doc('a'));
    await autosave.flush();
    expect(statuses.at(-1)).toEqual({ kind: 'error', retryInMs: 2_000 });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(statuses.at(-1)?.kind).toBe('saved');
  });

  it('passes keepalive through flush', async () => {
    const { autosave, save } = setup();
    autosave.change(() => doc('a'));
    await autosave.flush({ keepalive: true });
    expect(save.mock.calls[0]?.[2]).toEqual({ keepalive: true });
  });
});
