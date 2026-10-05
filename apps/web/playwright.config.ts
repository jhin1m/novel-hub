import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

// E2E chạy cô lập với môi trường dev: DB và Redis test, port riêng, không gửi mail thật.
process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
const { TEST_DATABASE_URL, TEST_REDIS_URL } = process.env;
if (!TEST_DATABASE_URL || !TEST_REDIS_URL) {
  throw new Error('E2E cần TEST_DATABASE_URL và TEST_REDIS_URL trong .env');
}

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: { baseURL: BASE_URL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec vite dev --port ${PORT} --strictPort`,
    url: `${BASE_URL}/api/v1/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    // Biến đặt ở đây thắng `.env` (`loadServerEnv` không ghi đè biến đã có).
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      REDIS_URL: TEST_REDIS_URL,
      APP_URL: BASE_URL,
      BETTER_AUTH_URL: BASE_URL,
      // Web không gửi mail (worker gửi) và e2e không chạy worker: job mail chỉ nằm trong
      // Redis test dưới tiền tố `e2e`. Giữ rỗng phòng khi `.env` dev có SMTP thật.
      SMTP_HOST: '',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      QUEUE_PREFIX: 'e2e',
      // The suite signs up and signs in many times from one address; global setup clears the
      // counters left by earlier runs.
      RATE_LIMIT_FACTOR: '50',
      TRUST_CF_IP: 'false',
    },
  },
});
