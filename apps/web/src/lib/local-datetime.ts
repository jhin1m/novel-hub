/**
 * `<input type="datetime-local">` values read as the device's wall-clock time, the way authors
 * schedule chapters (moderation forms use `vn-datetime` instead).
 */

const LOCAL_VALUE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** `datetime-local` value (local wall-clock time, minute precision) for a date. */
export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * The ISO timestamp of a `datetime-local` value read as local time; `null` when the value is empty
 * or not a real date and time (`2026-02-30`, which `Date` would roll over).
 */
export function fromLocalInputValue(value: string): string | null {
  if (!LOCAL_VALUE.test(value)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || toLocalInputValue(date) !== value) return null;
  return date.toISOString();
}
