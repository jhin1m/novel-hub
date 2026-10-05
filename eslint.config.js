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
    // Web code can end up in the browser bundle: it may only use the API client entry, and must not pull in
    // server code (`core`, `db`, env, `src/server/*`, and through them `pg`, `ioredis`).
    // `import type` is still allowed because it is erased at build time. Server-only code and tests
    // are exempt.
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ignores: [
      'apps/web/src/server/**',
      'apps/web/src/server-fns/**',
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
              message: 'Browser code may only import `@novel-hub/api/client`.',
              allowTypeImports: true,
            },
            {
              name: '@novel-hub/auth',
              message: 'Server code; browsers use `lib/auth-client.ts`.',
              allowTypeImports: true,
            },
            {
              name: '@novel-hub/shared/env',
              message: 'Env is read on the server only (uses `node:fs`).',
            },
          ],
          patterns: [
            {
              group: ['@novel-hub/core', '@novel-hub/core/*', '@novel-hub/db', '@novel-hub/db/*'],
              message:
                'Server code; call it via `createServerFn` or the API, do not import it from web.',
              allowTypeImports: true,
            },
            {
              group: ['**/server/*', '!@tanstack/**'],
              message: 'Modules in `src/server/` are for server routes or server functions only.',
            },
          ],
        },
      ],
    },
  },
  {
    // Config files usually belong to no tsconfig, so typed linting is turned off.
    files: ['**/*.{js,mjs,cjs}', '**/*.config.ts'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
