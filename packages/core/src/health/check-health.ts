import type { Db } from '@novel-hub/db';
import { sql } from 'drizzle-orm';
import { withTimeout } from '../lib/with-timeout';

export type CheckStatus = 'up' | 'down';

export interface HealthChecks {
  postgres: CheckStatus;
  redis: CheckStatus;
}

/** Chỉ chứa trạng thái up/down; chi tiết lỗi chỉ ghi log, không trả ra ngoài. */
export interface HealthReport {
  status: 'ok' | 'unhealthy';
  checks: HealthChecks;
}

export interface CheckHealthDeps {
  pingPostgres: () => Promise<unknown>;
  pingRedis: () => Promise<unknown>;
  /** Thời gian chờ tối đa của mỗi check (ms). Mặc định 2000. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 2_000;

/** `select 1` qua pool của app. */
export async function pingPostgres(db: Pick<Db, 'execute'>): Promise<void> {
  await db.execute(sql`select 1`);
}

/** Chạy song song các check, mỗi check có timeout riêng; check lỗi được log kèm tên. */
export async function checkHealth(deps: CheckHealthDeps): Promise<HealthReport> {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const run = async (name: keyof HealthChecks, ping: () => Promise<unknown>) => {
    try {
      // `Promise.resolve().then` để cả lỗi ném đồng bộ cũng thành `down`.
      await withTimeout(Promise.resolve().then(ping), timeoutMs, name);
      return 'up' as const;
    } catch (err) {
      console.error(`[health] ${name} down:`, err instanceof Error ? err.message : err);
      return 'down' as const;
    }
  };

  const [postgres, redis] = await Promise.all([
    run('postgres', deps.pingPostgres),
    run('redis', deps.pingRedis),
  ]);
  const checks: HealthChecks = { postgres, redis };
  const allUp = Object.values(checks).every((s) => s === 'up');
  return { status: allUp ? 'ok' : 'unhealthy', checks };
}
