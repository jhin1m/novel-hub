import { createApp } from '@novel-hub/api';
import type { HealthReport } from '@novel-hub/core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { createApiClient } from './api-client';

describe('createApiClient', () => {
  it('gọi /api/v1/health và suy ra type HealthReport', async () => {
    const report: HealthReport = { status: 'ok', checks: { postgres: 'up', redis: 'up' } };
    const app = createApp({
      checkHealth: () => Promise.resolve(report),
      appUrl: 'http://localhost',
      auth: {
        handler: () => Promise.resolve(new Response(null, { status: 404 })),
        lookupSession: () => Promise.resolve({ user: null, setCookies: [] }),
      },
    });
    const client = createApiClient('http://localhost', {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => app.request(input, init),
    });

    const res = await client.api.v1.health.$get();
    expect(res.status).toBe(200);
    if (res.status !== 200) throw new Error('unreachable');
    const body = await res.json();
    expectTypeOf(body).toEqualTypeOf<HealthReport>();
    expect(body).toEqual(report);
  });
});
