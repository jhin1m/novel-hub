import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { validate } from './validate';

const app = new Hono().post('/', validate('json', z.object({ title: z.string().min(2) })), (c) =>
  c.json({ title: c.req.valid('json').title }, 200),
);

function post(body: unknown) {
  return app.request('/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('validate', () => {
  it('passes parsed input to the handler', async () => {
    const res = await post({ title: 'ab' });
    expect(await res.json()).toEqual({ title: 'ab' });
  });

  it('answers 400 VALIDATION_ERROR in the API error shape without echoing issues', async () => {
    const res = await post({ title: 'a' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request data' },
    });
  });
});
