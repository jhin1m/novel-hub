import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleError } from './errors';

function appThrowing(err: Error) {
  return new Hono()
    .get('/x', () => {
      throw err;
    })
    .onError(handleError);
}

describe('handleError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('HTTPException 4xx giữ status, code và message', async () => {
    const res = await appThrowing(new HTTPException(400, { message: 'JSON sai' })).request('/x');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: 'BAD_REQUEST', message: 'JSON sai' } });
  });

  it('HTTPException có response riêng thì trả nguyên response đó', async () => {
    const custom = new Response(null, {
      status: 401,
      headers: { 'WWW-Authenticate': 'Bearer' },
    });
    const res = await appThrowing(new HTTPException(401, { res: custom })).request('/x');
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe('Bearer');
  });

  it('HTTPException 5xx giữ status nhưng không lộ message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await appThrowing(new HTTPException(503, { message: 'nội bộ' })).request('/x');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Lỗi máy chủ' } });
  });
});
