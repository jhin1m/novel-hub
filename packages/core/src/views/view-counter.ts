import { VIEW_RULES } from '@novel-hub/shared';
import type { Redis } from 'ioredis';
import { viewKeys } from './view-keys';

export interface ViewRecord {
  chapterId: string;
  /** `u:{userId}` or `a:{anonymous cookie}`; stays inside Redis. */
  viewer: string;
  /** `null` when the server cannot tell (dev): only the per-viewer cap applies. */
  ip: string | null;
  /** Stats day, `statsDate(now)`. */
  date: string;
}

export interface ViewCounter {
  /** Counts one read unless a per-day cap is reached; `true` when it was counted. */
  record(view: ViewRecord): Promise<boolean>;
}

/**
 * One round trip, atomic. Checks the viewer's and the IP's reads of the chapter today against
 * their caps first and writes nothing when either is reached, so requests past a cap (a client
 * dropping its cookie on every request, say) never create keys. Otherwise bumps both counters,
 * counts the read, adds the viewer to the day's HyperLogLog and marks the chapter for the next
 * flush. Every key expires after `keyTtlSec`.
 *
 * KEYS: viewer, ip, views, uv, dirty. ARGV: viewer, perViewer, perIp, ttl, hasIp, chapterId.
 */
const RECORD_VIEW_LUA = `
local ttl = tonumber(ARGV[4])
local hasIp = ARGV[5] == '1'
if tonumber(redis.call('GET', KEYS[1]) or '0') >= tonumber(ARGV[2]) then return 0 end
if hasIp and tonumber(redis.call('GET', KEYS[2]) or '0') >= tonumber(ARGV[3]) then return 0 end
redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], ttl)
if hasIp then
  redis.call('INCR', KEYS[2])
  redis.call('EXPIRE', KEYS[2], ttl)
end
redis.call('INCR', KEYS[3])
redis.call('EXPIRE', KEYS[3], ttl)
redis.call('PFADD', KEYS[4], ARGV[1])
redis.call('EXPIRE', KEYS[4], ttl)
redis.call('SADD', KEYS[5], ARGV[6])
redis.call('EXPIRE', KEYS[5], ttl)
return 1
`;

type RecordViewCommand = (
  viewerKey: string,
  ipKey: string,
  viewsKey: string,
  uvKey: string,
  dirtyKey: string,
  viewer: string,
  perViewer: number,
  perIp: number,
  ttl: number,
  hasIp: '0' | '1',
  chapterId: string,
) => Promise<number>;

const COMMAND = 'novelHubRecordView';

/** View counter on `redis` (any connection; the web passes its producer connection). */
export function createViewCounter(redis: Redis, prefix: string): ViewCounter {
  // `defineCommand` sends the script by SHA after the first call.
  redis.defineCommand(COMMAND, { numberOfKeys: 5, lua: RECORD_VIEW_LUA });
  const run = (redis as Redis & Record<typeof COMMAND, RecordViewCommand>)[COMMAND].bind(redis);
  return {
    async record({ chapterId, viewer, ip, date }) {
      const keys = viewKeys(prefix, date);
      const counted = await run(
        keys.viewer(chapterId, viewer),
        // Never touched when there is no IP; a real key keeps the call shape fixed.
        ip === null ? keys.viewer(chapterId, viewer) : keys.ip(chapterId, ip),
        keys.views(chapterId),
        keys.uniqueViewers(chapterId),
        keys.dirty,
        viewer,
        VIEW_RULES.perViewerPerDay,
        VIEW_RULES.perIpPerDay,
        VIEW_RULES.keyTtlSec,
        ip === null ? '0' : '1',
        chapterId,
      );
      return counted === 1;
    },
  };
}
