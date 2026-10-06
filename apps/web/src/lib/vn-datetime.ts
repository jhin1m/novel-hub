/**
 * `<input type="datetime-local">` values read as Vietnam time, whatever the browser's time zone.
 * Vietnam keeps UTC+7 all year (no daylight saving), so a fixed offset is exact.
 */

const VN_OFFSET = '+07:00';
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const LOCAL_VALUE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** `YYYY-MM-DDTHH:mm` in Vietnam time for an instant (ISO string or `Date`), to the minute. */
export function toVnDateTimeLocal(instant: string | Date): string {
  const ms = new Date(instant).getTime();
  return new Date(ms + VN_OFFSET_MS).toISOString().slice(0, 16);
}

/**
 * The ISO timestamp with offset (`…T08:00:00+07:00`) of a `datetime-local` value read as Vietnam
 * time; `null` when the value is empty or not a real date and time.
 */
export function fromVnDateTimeLocal(value: string): string | null {
  if (!LOCAL_VALUE.test(value)) return null;
  const iso = `${value}:00${VN_OFFSET}`;
  const ms = Date.parse(iso);
  // Rejects dates that do not exist (`2026-02-30`), which `Date.parse` may roll over.
  if (Number.isNaN(ms) || toVnDateTimeLocal(new Date(ms)) !== value) return null;
  return iso;
}
