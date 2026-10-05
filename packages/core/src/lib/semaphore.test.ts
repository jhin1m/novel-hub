import { describe, expect, it } from 'vitest';
import { SemaphoreFullError, createSemaphore } from './semaphore';

function deferred() {
  let resolve!: () => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createSemaphore', () => {
  it('runs at most two tasks at once; the third starts when one finishes', async () => {
    const run = createSemaphore(2);
    const gates = [deferred(), deferred(), deferred()];
    const started: number[] = [];
    let active = 0;
    let peak = 0;
    const results = gates.map((gate, i) =>
      run(async () => {
        started.push(i);
        active++;
        peak = Math.max(peak, active);
        await gate.promise;
        active--;
        return i;
      }),
    );

    await tick();
    expect(started).toEqual([0, 1]);
    gates[1]?.resolve();
    await tick();
    expect(started).toEqual([0, 1, 2]);
    gates[0]?.resolve();
    gates[2]?.resolve();
    expect(await Promise.all(results)).toEqual([0, 1, 2]);
    expect(peak).toBe(2);
  });

  it('rejects new tasks once the waiting queue is full', async () => {
    const run = createSemaphore(1, 1);
    const gate = deferred();
    const first = run(() => gate.promise);
    const second = run(() => Promise.resolve('queued'));
    await expect(run(() => Promise.resolve('overflow'))).rejects.toBeInstanceOf(SemaphoreFullError);
    gate.resolve();
    await first;
    await expect(second).resolves.toBe('queued');
  });

  it('releases the slot when a task throws', async () => {
    const run = createSemaphore(1);
    await expect(run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(run(() => Promise.resolve('next'))).resolves.toBe('next');
  });
});
