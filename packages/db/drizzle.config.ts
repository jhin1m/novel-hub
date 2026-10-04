import { dbEnvSchema, loadServerEnv } from '@novel-hub/shared/env';
import { defineConfig } from 'drizzle-kit';

// `loadServerEnv` tự nạp `.env` ở gốc repo. URL chỉ dùng cho `drizzle-kit studio`;
// migrate chạy qua `src/migrate.ts`, không dùng `drizzle-kit migrate/push`.
const { DATABASE_URL } = loadServerEnv(dbEnvSchema);

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  casing: 'snake_case',
  dbCredentials: { url: DATABASE_URL },
});
