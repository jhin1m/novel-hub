import type { EditorDocJson } from '@novel-hub/shared';

export type SaveStatus =
  | { kind: 'saved'; at: Date }
  | { kind: 'dirty' }
  | { kind: 'saving' }
  /** `retryInMs` is null when the error will not be retried (needs a reload or user action). */
  | { kind: 'error'; retryInMs: number | null }
  | { kind: 'conflict' };

export type SaveOutcome =
  { ok: true; updatedAt: string } | { ok: false; kind: 'conflict' | 'fatal' | 'retryable' };

export interface TimerPort {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface AutosaveOptions {
  save: (
    doc: EditorDocJson,
    baseUpdatedAt: string,
    opts: { keepalive: boolean },
  ) => Promise<SaveOutcome>;
  /** Draft version the editor was loaded from. */
  initialBase: string;
  /** JSON of the loaded document, so an unchanged document is never saved. */
  initialJson?: string;
  debounceMs?: number;
  maxWaitMs?: number;
  onStatus: (status: SaveStatus) => void;
  /** Called with the JSON the server just confirmed. */
  onSaved?: (json: string) => void;
  timers?: TimerPort;
  now?: () => Date;
}

export interface Autosave {
  /** Marks the document as changed; `getDoc` is only called when a save actually runs. */
  change(getDoc: () => EditorDocJson): void;
  /** Saves pending changes now (waiting for a request already in flight first). */
  flush(opts?: { keepalive?: boolean }): Promise<void>;
  /**
   * Flushes, then stops scheduling saves until `resume()`. Changes made meanwhile are only marked.
   * Resolves with the status after the flush: only `saved` means the server has everything.
   */
  pause(): Promise<SaveStatus>;
  resume(): void;
  /** Adopts a version obtained elsewhere (reload, publish, restore) and clears a conflict. */
  rebase(updatedAt: string, savedJson: string): void;
  hasPendingChanges(): boolean;
  getBase(): string;
  dispose(): void;
}

/** Wait before retrying after a network or server error; the last value repeats. */
export const RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 16_000, 30_000] as const;

// Resolved on every call so test fake timers apply.
const globalTimers: TimerPort = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Debounced draft saving with at most one request in flight. A change during a request triggers
 * one more save after it. Conflicts and non-retryable errors stop saving until `rebase()`.
 * Framework-free so it can be tested with fake timers.
 */
export function createAutosave(opts: AutosaveOptions): Autosave {
  const debounceMs = opts.debounceMs ?? 2_000;
  const maxWaitMs = opts.maxWaitMs ?? 10_000;
  const timers = opts.timers ?? globalTimers;
  const now = opts.now ?? (() => new Date());

  let base = opts.initialBase;
  let lastSavedJson = opts.initialJson ?? null;
  let pending: (() => EditorDocJson) | null = null;
  let firstChangeAt: number | null = null;
  let debounceTimer: unknown = null;
  let retryTimer: unknown = null;
  let retryCount = 0;
  let inFlight: Promise<void> | null = null;
  let paused = false;
  let stopped = false;
  let disposed = false;
  let status: SaveStatus = { kind: 'saved', at: now() };

  const emit = (next: SaveStatus) => {
    status = next;
    if (!disposed) opts.onStatus(next);
  };

  const clearTimers = () => {
    if (debounceTimer !== null) timers.clearTimeout(debounceTimer);
    if (retryTimer !== null) timers.clearTimeout(retryTimer);
    debounceTimer = null;
    retryTimer = null;
  };

  const schedule = () => {
    if (paused || stopped || disposed || inFlight || retryTimer !== null || !pending) return;
    const t = now().getTime();
    firstChangeAt ??= t;
    if (debounceTimer !== null) timers.clearTimeout(debounceTimer);
    const delay = Math.max(0, Math.min(debounceMs, firstChangeAt + maxWaitMs - t));
    debounceTimer = timers.setTimeout(() => {
      debounceTimer = null;
      void flush();
    }, delay);
  };

  const runSave = async (doc: EditorDocJson, json: string, keepalive: boolean) => {
    emit({ kind: 'saving' });
    let outcome: SaveOutcome;
    try {
      // Through a promise so a synchronous throw is handled like a rejected save.
      outcome = await Promise.resolve().then(() => opts.save(doc, base, { keepalive }));
    } catch {
      outcome = { ok: false, kind: 'retryable' };
    }
    inFlight = null;
    if (disposed) return;

    if (outcome.ok) {
      base = outcome.updatedAt;
      lastSavedJson = json;
      retryCount = 0;
      opts.onSaved?.(json);
      if (pending) {
        emit({ kind: 'dirty' });
        schedule();
      } else {
        emit({ kind: 'saved', at: now() });
      }
      return;
    }

    // Keep the unsaved document: newer changes, if any, already contain it.
    pending ??= () => doc;
    if (outcome.kind === 'conflict') {
      stopped = true;
      emit({ kind: 'conflict' });
    } else if (outcome.kind === 'fatal') {
      stopped = true;
      emit({ kind: 'error', retryInMs: null });
    } else {
      const delay = RETRY_DELAYS_MS[Math.min(retryCount, RETRY_DELAYS_MS.length - 1)] ?? 30_000;
      retryCount += 1;
      emit({ kind: 'error', retryInMs: delay });
      if (!paused) {
        retryTimer = timers.setTimeout(() => {
          retryTimer = null;
          void flush();
        }, delay);
      }
    }
  };

  const flush = async ({ keepalive = false }: { keepalive?: boolean } = {}) => {
    if (debounceTimer !== null) timers.clearTimeout(debounceTimer);
    debounceTimer = null;
    while (inFlight) await inFlight;
    if (!pending || stopped || disposed) return;

    const doc = pending();
    const json = JSON.stringify(doc);
    pending = null;
    firstChangeAt = null;
    if (json === lastSavedJson) {
      // Typing then undoing (also after a failed save), or ids added on load: the server already
      // has this document, so a pending retry is moot.
      if (retryTimer !== null) timers.clearTimeout(retryTimer);
      retryTimer = null;
      retryCount = 0;
      emit({ kind: 'saved', at: now() });
      return;
    }
    if (retryTimer !== null) timers.clearTimeout(retryTimer);
    retryTimer = null;
    inFlight = runSave(doc, json, keepalive);
    await inFlight;
  };

  return {
    change(getDoc) {
      pending = getDoc;
      if (disposed || stopped) return;
      if (!inFlight && status.kind !== 'error') emit({ kind: 'dirty' });
      schedule();
    },
    flush,
    async pause() {
      paused = true;
      clearTimers();
      await flush();
      return status;
    },
    resume() {
      paused = false;
      if (status.kind === 'error' && status.retryInMs === null) return;
      schedule();
    },
    rebase(updatedAt, savedJson) {
      base = updatedAt;
      lastSavedJson = savedJson;
      stopped = false;
      retryCount = 0;
      clearTimers();
      if (pending) {
        emit({ kind: 'dirty' });
        schedule();
      } else {
        emit({ kind: 'saved', at: now() });
      }
    },
    hasPendingChanges: () => pending !== null || inFlight !== null,
    getBase: () => base,
    dispose() {
      disposed = true;
      clearTimers();
    },
  };
}
