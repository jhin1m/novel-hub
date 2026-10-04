import { defineConfig } from 'vitest/config';

const TEST_ROOTS = '{packages,apps}/*/src/**';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: [`${TEST_ROOTS}/*.test.{ts,tsx}`],
          exclude: ['**/node_modules/**', '**/*.int.test.{ts,tsx}'],
        },
      },
      {
        // Postgres/Redis thật, dùng chung một DB test nên chạy tuần tự từng file.
        test: {
          name: 'integration',
          environment: 'node',
          include: [`${TEST_ROOTS}/*.int.test.{ts,tsx}`],
          exclude: ['**/node_modules/**'],
          fileParallelism: false,
          globalSetup: ['packages/db/src/testing/global-setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
    passWithNoTests: true,
  },
});
