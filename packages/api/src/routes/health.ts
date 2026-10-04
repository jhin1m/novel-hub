import { Hono } from 'hono';
import type { ApiDeps } from '../deps';
import { errorBody } from '../lib/errors';

export function createHealthRoutes(deps: Pick<ApiDeps, 'checkHealth'>) {
  return new Hono().get('/', async (c) => {
    const report = await deps.checkHealth();
    if (report.status === 'ok') return c.json(report, 200);
    return c.json(
      { ...errorBody('UNHEALTHY', 'Có dịch vụ phụ thuộc không phản hồi'), checks: report.checks },
      503,
    );
  });
}
