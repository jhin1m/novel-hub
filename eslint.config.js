import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Server-only web code and tests: free to import server packages. */
const BROWSER_IMPORT_EXEMPT = [
  'apps/web/src/server/**',
  'apps/web/src/server-fns/**',
  'apps/web/src/routes/api/**',
  'apps/web/src/**/*.test.{ts,tsx}',
];

/** The only browser code allowed to load Tiptap. */
const EDITOR_AREA = ['apps/web/src/components/editor/**/*.{ts,tsx}'];

const BROWSER_IMPORT_PATHS = [
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
];

const BROWSER_IMPORT_PATTERNS = [
  {
    group: ['@novel-hub/core', '@novel-hub/core/*', '@novel-hub/db', '@novel-hub/db/*'],
    message: 'Server code; call it via `createServerFn` or the API, do not import it from web.',
    allowTypeImports: true,
  },
  {
    group: ['**/server/*', '!@tanstack/**'],
    message: 'Modules in `src/server/` are for server routes or server functions only.',
  },
];

const TIPTAP_IMPORT_PATTERN = {
  group: ['@tiptap/*', '@novel-hub/shared/editor'],
  message: 'Tiptap is only loaded in `src/components/editor/`; keep it out of other bundles.',
  allowTypeImports: true,
};

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
    // are exempt. Tiptap is only allowed in the editor area, so the reading pages never load it.
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ignores: [...BROWSER_IMPORT_EXEMPT, ...EDITOR_AREA],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: BROWSER_IMPORT_PATHS,
          patterns: [...BROWSER_IMPORT_PATTERNS, TIPTAP_IMPORT_PATTERN],
        },
      ],
    },
  },
  {
    // The editor area: same browser restrictions (one block per file set, because a later block
    // replaces the rule options instead of merging them), minus the Tiptap ban.
    files: EDITOR_AREA,
    ignores: BROWSER_IMPORT_EXEMPT,
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { paths: BROWSER_IMPORT_PATHS, patterns: BROWSER_IMPORT_PATTERNS },
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
