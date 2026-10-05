/** Thrown when a semaphore's waiting queue is already full. */
export class SemaphoreFullError extends Error {
  constructor() {
    super('Too many tasks waiting');
    this.name = 'SemaphoreFullError';
  }
}

/**
 * Limits how many tasks run at once inside this process; extra tasks wait in FIFO order, at most
 * `maxWaiting` of them (beyond that the call rejects with `SemaphoreFullError`). A task that throws
 * still releases its slot.
 */
export function createSemaphore(
  max: number,
  maxWaiting = Number.POSITIVE_INFINITY,
): <T>(task: () => Promise<T>) => Promise<T> {
  let running = 0;
  const waiting: (() => void)[] = [];

  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else running--;
  };

  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (running < max) running++;
    else if (waiting.length >= maxWaiting) throw new SemaphoreFullError();
    // The releasing task hands its slot over directly, so `running` stays unchanged.
    else await new Promise<void>((resolve) => waiting.push(resolve));
    try {
      return await task();
    } finally {
      release();
    }
  };
}
