import { EventEmitter } from 'node:events';
import type { Redis } from 'ioredis';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { logRedisErrors } from './redis';

afterEach(() => {
  vi.restoreAllMocks();
});

/** Giả lập ioredis: chỉ cần `status` và các sự kiện `error`/`ready`. */
function fakeRedis(status: string) {
  return Object.assign(new EventEmitter(), { status }) as unknown as Redis & EventEmitter;
}

describe('logRedisErrors', () => {
  it('đang mất kết nối → chỉ ghi lỗi đầu tiên, nối lại rồi mất lần nữa thì ghi tiếp', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const redis = fakeRedis('reconnecting');
    logRedisErrors(redis, '[t]');

    redis.emit('error', new Error('ECONNREFUSED'));
    redis.emit('error', new Error('ECONNREFUSED'));
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith('[t] lỗi kết nối:', 'ECONNREFUSED');

    redis.emit('ready');
    redis.emit('error', new Error('ECONNREFUSED'));
    expect(error).toHaveBeenCalledTimes(2);
  });

  it('kết nối đang tốt → lỗi nào của source cũng được ghi', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const redis = fakeRedis('ready');
    const worker = new EventEmitter();
    logRedisErrors(redis, '[w]', worker);

    worker.emit('error', new Error('stalled check lỗi'));
    worker.emit('error', new Error('lock lỗi'));
    expect(error).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenLastCalledWith('[w] lỗi:', 'lock lỗi');
  });
});
