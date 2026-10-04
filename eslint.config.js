import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.output/**',
      '**/.tanstack/**',
      '**/.nitro/**',
      '**/routeTree.gen.ts',
      '**/src/paraglide/**',
      'packages/db/drizzle/**',
      '**/test-results/**',
      '**/playwright-report/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: { globals: globals.browser },
  },
  {
    // Code web có thể vào bundle browser: chỉ được dùng entry client của API, không kéo
    // theo code server (`core`, `db`, env, `src/server/*`, và qua đó `pg`, `ioredis`).
    // `import type` vẫn được phép vì bị xoá khi build. Code chỉ chạy ở server và test
    // được miễn.
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ignores: [
      'apps/web/src/server/**',
      'apps/web/src/routes/api/**',
      'apps/web/src/**/*.test.{ts,tsx}',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@novel-hub/api',
              message: 'Phía browser chỉ import `@novel-hub/api/client`.',
              allowTypeImports: true,
            },
            {
              name: '@novel-hub/auth',
              message: 'Code server; browser dùng `lib/auth-client.ts`.',
              allowTypeImports: true,
            },
            {
              name: '@novel-hub/shared/env',
              message: 'Env chỉ đọc ở server (dùng `node:fs`).',
            },
          ],
          patterns: [
            {
              group: ['@novel-hub/core', '@novel-hub/core/*', '@novel-hub/db', '@novel-hub/db/*'],
              message: 'Code server; gọi qua `createServerFn` hoặc API, không import từ web.',
              allowTypeImports: true,
            },
            {
              group: ['**/server/*', '!@tanstack/**'],
              message: 'Module trong `src/server/` chỉ dùng ở server route hoặc server function.',
            },
          ],
        },
      ],
    },
  },
  {
    // File cấu hình thường không thuộc tsconfig nào nên tắt lint có type.
    files: ['**/*.{js,mjs,cjs}', '**/*.config.ts'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
