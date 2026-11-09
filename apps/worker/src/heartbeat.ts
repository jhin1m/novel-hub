import { writeFileSync } from 'node:fs';

export interface HeartbeatOptions {
  /** File whose contents (a millisecond timestamp) are refreshed while the worker is healthy. */
  file: string;
  /** Called on every tick; the file is only refreshed when it returns true. */
  isHealthy: () => boolean;
  /** Time between ticks (ms). */
  intervalMs?: number;
}

/**
 * Keeps a file fresh for as long as the worker is healthy, so a container healthcheck can read
 * its age (the worker has no HTTP port). Writes once immediately, then on every tick. A failed
 * write is logged and the file simply goes stale. Returns a function that stops the timer.
 */
export function startHeartbeat({
  file,
  isHealthy,
  intervalMs = 30_000,
}: HeartbeatOptions): () => void {
  const beat = (): void => {
    if (!isHealthy()) return;
    try {
      writeFileSync(file, String(Date.now()));
    } catch (err) {
      console.error('[worker] heartbeat write failed:', err instanceof Error ? err.message : err);
    }
  };
  beat();
  const timer = setInterval(beat, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
