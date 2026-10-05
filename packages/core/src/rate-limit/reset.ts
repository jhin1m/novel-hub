import type { Redis } from 'ioredis';
import { rateLimitKeyPrefix } from './limiter';

/**
 * Deletes every rate limit counter under `prefix` and returns how many. For tests and e2e setup
 * only: in production it would lift every running limit at once.
 */
export async function resetRateLimits(redis: Redis, prefix: string): Promise<number> {
  let deleted = 0;
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(
      cursor,
      'MATCH',
      `${rateLimitKeyPrefix(prefix)}:*`,
      'COUNT',
      500,
    );
    cursor = next;
    if (keys.length > 0) deleted += await redis.del(...keys);
  } while (cursor !== '0');
  return deleted;
}
