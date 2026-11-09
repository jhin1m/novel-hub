import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startHeartbeat } from './heartbeat';

describe('startHeartbeat', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    vi.useFakeTimers();
    dir = mkdtempSync(join(tmpdir(), 'heartbeat-'));
    file = join(dir, 'beat');
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes immediately and refreshes on every tick while healthy', () => {
    vi.setSystemTime(1_000);
    const stop = startHeartbeat({ file, isHealthy: () => true, intervalMs: 100 });
    expect(readFileSync(file, 'utf8')).toBe('1000');
    vi.advanceTimersByTime(100);
    expect(readFileSync(file, 'utf8')).toBe('1100');
    stop();
  });

  it('leaves the file stale while unhealthy and resumes afterwards', () => {
    vi.setSystemTime(1_000);
    let healthy = false;
    const stop = startHeartbeat({ file, isHealthy: () => healthy, intervalMs: 100 });
    expect(existsSync(file)).toBe(false);
    healthy = true;
    vi.advanceTimersByTime(100);
    expect(readFileSync(file, 'utf8')).toBe('1100');
    healthy = false;
    vi.advanceTimersByTime(300);
    expect(readFileSync(file, 'utf8')).toBe('1100');
    stop();
  });

  it('stops writing after the returned stop function is called', () => {
    vi.setSystemTime(1_000);
    const stop = startHeartbeat({ file, isHealthy: () => true, intervalMs: 100 });
    stop();
    vi.advanceTimersByTime(500);
    expect(readFileSync(file, 'utf8')).toBe('1000');
  });

  it('logs and keeps running when the file cannot be written', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const stop = startHeartbeat({
      file: join(dir, 'missing-dir', 'beat'),
      isHealthy: () => true,
      intervalMs: 100,
    });
    vi.advanceTimersByTime(100);
    expect(spy).toHaveBeenCalledTimes(2);
    stop();
    spy.mockRestore();
  });
});
