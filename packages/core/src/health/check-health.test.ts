import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkHealth } from './check-health';

const ok = () => Promise.resolve();

describe('checkHealth', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('cả hai ping ok → status ok', async () => {
    await expect(checkHealth({ pingPostgres: ok, pingRedis: ok })).resolves.toEqual({
      status: 'ok',
      checks: { postgres: 'up', redis: 'up' },
    });
  });

  it('ping Postgres treo quá timeout → postgres down, trả về đúng lúc hết hạn', async () => {
    vi.useFakeTimers();
    let settled = false;
    const pending = checkHealth({
      pingPostgres: () => new Promise(() => {}),
      pingRedis: ok,
      timeoutMs: 2_000,
    }).finally(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(1_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({
      status: 'unhealthy',
      checks: { postgres: 'down', redis: 'up' },
    });
  });

  it('ping Redis reject → redis down, report không chứa message lỗi', async () => {
    const report = await checkHealth({
      pingPostgres: ok,
      pingRedis: () => Promise.reject(new Error('ECONNREFUSED 10.0.0.5:6379')),
    });
    expect(report).toEqual({ status: 'unhealthy', checks: { postgres: 'up', redis: 'down' } });
    expect(JSON.stringify(report)).not.toContain('ECONNREFUSED');
    expect(console.error).toHaveBeenCalledWith(
      '[health] redis down:',
      'ECONNREFUSED 10.0.0.5:6379',
    );
  });

  it('ping ném lỗi đồng bộ → down, không throw ra ngoài', async () => {
    const report = await checkHealth({
      pingPostgres: () => {
        throw new Error('sync');
      },
      pingRedis: ok,
    });
    expect(report.checks.postgres).toBe('down');
  });

  it('các check chạy song song', async () => {
    vi.useFakeTimers();
    const slow = () => new Promise<void>((resolve) => setTimeout(resolve, 1_500));
    const pending = checkHealth({ pingPostgres: slow, pingRedis: slow, timeoutMs: 2_000 });
    await vi.advanceTimersByTimeAsync(1_500);
    await expect(pending).resolves.toMatchObject({ status: 'ok' });
  });
});
