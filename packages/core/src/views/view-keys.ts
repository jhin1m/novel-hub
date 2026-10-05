/**
 * Redis keys of the view counters, all under the queue prefix and scoped to one stats day:
 * - `v:views:{date}:{chapterId}`  counted reads not yet flushed (GETDEL by the flush)
 * - `v:uv:{date}:{chapterId}`     HyperLogLog of viewers (kept for the day, PFCOUNT by the flush)
 * - `v:dirty:{date}`              chapters with something to flush
 * - `v:viewer:{date}:{chapterId}:{viewer}` / `v:ip:{date}:{chapterId}:{ip}`  per-day caps
 */
export function viewKeys(prefix: string, date: string) {
  const base = `${prefix}:v`;
  return {
    views: (chapterId: string) => `${base}:views:${date}:${chapterId}`,
    uniqueViewers: (chapterId: string) => `${base}:uv:${date}:${chapterId}`,
    dirty: `${base}:dirty:${date}`,
    viewer: (chapterId: string, viewer: string) => `${base}:viewer:${date}:${chapterId}:${viewer}`,
    ip: (chapterId: string, ip: string) => `${base}:ip:${date}:${chapterId}:${ip}`,
  };
}
