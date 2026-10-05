import type { EditorDocJson } from '@novel-hub/shared';
import type { TimerPort } from './autosave';

/**
 * Local copy of the document being edited. `keepalive` requests are capped around 64 KB, so
 * closing the tab on a long chapter can lose the last edits; this copy is what brings them back.
 */
export interface DraftMirror {
  doc: EditorDocJson;
  baseUpdatedAt: string;
  savedAt: string;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
  );
}

/**
 * Whether two documents have the same content. Key order is ignored: documents read back from
 * Postgres `jsonb` come with their keys reordered.
 */
export function sameDoc(a: EditorDocJson, b: EditorDocJson): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/** Keyed by public id and chapter number only: no internal ids in the browser. */
export function mirrorKey(publicId: string, number: number): string {
  return `draft:${publicId}:${number}`;
}

/** `localStorage` when usable; it throws in some privacy modes and is absent during SSR. */
export function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function isMirror(value: unknown): value is DraftMirror {
  if (typeof value !== 'object' || value === null) return false;
  const { doc, baseUpdatedAt, savedAt } = value as Record<string, unknown>;
  return (
    typeof doc === 'object' &&
    doc !== null &&
    (doc as { type?: unknown }).type === 'doc' &&
    typeof baseUpdatedAt === 'string' &&
    typeof savedAt === 'string'
  );
}

/** Corrupt or missing data reads as no mirror. */
export function readMirror(storage: Storage | undefined, key: string): DraftMirror | null {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return isMirror(value) ? value : null;
  } catch {
    return null;
  }
}

/** Returns false when the write failed (quota, storage disabled); the editor keeps working. */
export function writeMirror(
  storage: Storage | undefined,
  key: string,
  mirror: DraftMirror,
): boolean {
  try {
    if (!storage) return false;
    storage.setItem(key, JSON.stringify(mirror));
    return true;
  } catch {
    return false;
  }
}

export function clearMirror(storage: Storage | undefined, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    // Storage disabled: nothing to clear.
  }
}

/**
 * Writes the mirror at most once per `intervalMs` (serializing a long chapter on every keystroke
 * is wasteful), always ending with the latest value.
 */
export function createMirrorWriter(opts: {
  storage: Storage | undefined;
  key: string;
  intervalMs?: number;
  timers?: TimerPort;
}) {
  const intervalMs = opts.intervalMs ?? 1_000;
  const timers: TimerPort = opts.timers ?? {
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
  let next: (() => DraftMirror) | null = null;
  let timer: unknown = null;

  const writeNow = () => {
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
    if (!next) return;
    writeMirror(opts.storage, opts.key, next());
    next = null;
  };

  return {
    write(getMirror: () => DraftMirror) {
      next = getMirror;
      timer ??= timers.setTimeout(writeNow, intervalMs);
    },
    flush: writeNow,
    cancel() {
      if (timer !== null) timers.clearTimeout(timer);
      timer = null;
      next = null;
    },
  };
}
