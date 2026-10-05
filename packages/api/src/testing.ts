/**
 * Test-only helpers (`@novel-hub/api/testing`). Every test that builds `createApp` goes through
 * `makeTestApiDeps`, so adding a dependency to `ApiDeps` means adding one default here instead of
 * fixing each test.
 */
import type { Db } from '@novel-hub/core';
import type { ApiDeps } from './deps';

export const TEST_APP_URL = 'http://localhost:3000';

/** Stand-in for `db` in tests that never query it; any use fails loudly instead of hanging. */
const unusedDb = new Proxy(
  {},
  {
    get() {
      throw new Error('db is not used in this test: pass `db` to makeTestApiDeps');
    },
  },
) as Db;

export function makeTestApiDeps(overrides: Partial<ApiDeps> = {}): ApiDeps {
  return {
    checkHealth: () => Promise.resolve({ status: 'ok', checks: { postgres: 'up', redis: 'up' } }),
    appUrl: TEST_APP_URL,
    auth: {
      handler: () => Promise.resolve(new Response(null, { status: 404 })),
      lookupSession: () => Promise.resolve({ user: null, setCookies: [] }),
    },
    db: unusedDb,
    storage: null,
    viewCounter: null,
    search: null,
    rateLimit: null,
    clientIp: () => null,
    ...overrides,
  };
}
