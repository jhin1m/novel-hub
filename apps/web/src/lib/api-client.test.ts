import { createApp } from '@novel-hub/api';
import { makeTestApiDeps } from '@novel-hub/api/testing';
import type { HealthReport } from '@novel-hub/core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { createApiClient } from './api-client';

describe('createApiClient', () => {
  it('calls /api/v1/health and infers the HealthReport type', async () => {
    const report: HealthReport = { status: 'ok', checks: { postgres: 'up', redis: 'up' } };
    const app = createApp(
      makeTestApiDeps({ checkHealth: () => Promise.resolve(report), appUrl: 'http://localhost' }),
    );
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
