/**
 * Outcome of a business operation whose expected failures are part of its contract (not found,
 * forbidden, invalid tag...). Routes map `error` to an HTTP status; unexpected failures still
 * throw and become a 500.
 */
export type Result<T, E extends string> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

export function err<E extends string>(error: E): { ok: false; error: E } {
  return { ok: false, error };
}
