/**
 * Redis keys of the view counters, all under the queue prefix and scoped to one stats day:
 * - `v:views:{date}:{chapterId}`  counted reads not yet flushed (GETDEL by the flush)
 * - `v:uv:{date}:{chapterId}`     HyperLogLog of viewers (kept for the day, PFCOUNT by the flush)
 * - `v:dirty:{date}`              chapters with something to flush
 * - `v:viewer:{date}:{chapterId}:{viewer}` / `v:ip:{date}:{chapterId}:{ip}`  per-day caps
 * - `v:suv:{date}:{storyId}`      HyperLogLog of the story's readers (rankings)
 * - `v:sip:{date}:{storyId}:{ip}` readers one IP added to the story today (per-story cap)
 * - `v:sdirty:{date}`             stories whose reader count changed since the last flush
 */
export function viewKeys(prefix: string, date: string) {
  const base = `${prefix}:v`;
  return {
    views: (chapterId: string) => `${base}:views:${date}:${chapterId}`,
    uniqueViewers: (chapterId: string) => `${base}:uv:${date}:${chapterId}`,
    dirty: `${base}:dirty:${date}`,
    viewer: (chapterId: string, viewer: string) => `${base}:viewer:${date}:${chapterId}:${viewer}`,
    ip: (chapterId: string, ip: string) => `${base}:ip:${date}:${chapterId}:${ip}`,
    storyReaders: (storyId: string) => `${base}:suv:${date}:${storyId}`,
    storyIp: (storyId: string, ip: string) => `${base}:sip:${date}:${storyId}:${ip}`,
    storyDirty: `${base}:sdirty:${date}`,
  };
}
