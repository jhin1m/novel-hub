# Research: infra, tooling, BullMQ (Giai đoạn 0)

Date: 2026-10-04. Versions from `npm view` / Docker Hub API. Nothing boot-tested.

## Ranked decisions
1. Pin `typescript@~6.0.3` (typescript-eslint 8.71.0 peer `<6.1.0`; TS 7.0.2 is latest).
2. **MinIO archived 2026-04-25**, no binaries since Oct 2025 → spec "Dev dùng MinIO" needs user decision. Ranking: SeaweedFS > Garage > real R2 dev bucket. RustFS: avoid (alpha/security concerns).
3. No turbo: `pnpm -r` + root `eslint .` + root `vitest run`.
4. Node 24 LTS (v24.21.0). `.nvmrc`=24, `engines.node ">=24 <25"`.
5. Skip `eslint-plugin-react` (no ESLint 10 support).

## Monorepo / TS
- pnpm 12.9.1; `"packageManager": "pnpm@12.9.1"`; pnpm settings live in `pnpm-workspace.yaml`; use `catalog:` for shared versions (typescript, zod, vitest).
- Build-script allow-list (`allowBuilds`/`onlyBuiltDependencies`) unverified for pnpm 12; expect `sharp`, `esbuild`.
- Scripts: `typecheck` = `pnpm -r --parallel typecheck` (each `tsc --noEmit`); `lint` = root `eslint .`; `test` = root vitest; `format`, `format:check`.
- JIT internal packages (exports → `./src/index.ts`), no project refs.
- `tsconfig.base.json`: strict, noUncheckedIndexedAccess, noImplicitOverride, noFallthroughCasesInSwitch, verbatimModuleSyntax, isolatedModules, moduleDetection force, module esnext, moduleResolution bundler, target es2023, lib es2023 (web adds DOM), skipLibCheck, noEmit, esModuleInterop, resolveJsonModule. Skip exactOptionalPropertyTypes.
- TS 6 gotcha: `types` defaults to `[]` → set `"types": ["node"]` per package. No `baseUrl`.

## ESLint / Prettier
- eslint 10.12.0, typescript-eslint 8.71.0, @eslint/js 10.0.1, globals 17.13.0, eslint-plugin-react-hooks 7.1.1, eslint-config-prettier 10.1.8, prettier 3.9.9, prettier-plugin-tailwindcss 0.8.1.
- Root flat config: ignores (`**/dist`, `.output`, `.tanstack`, `**/routeTree.gen.ts`, `packages/db/drizzle/**`), `js.configs.recommended`, `tseslint.configs.recommendedTypeChecked` with `projectService: true`, `consistent-type-imports`, `no-explicit-any: error`, react-hooks only on `apps/web/**`, `disableTypeChecked` on config/JS files, `eslint-config-prettier/flat` last.
- `.prettierrc`: singleQuote, trailingComma all, printWidth 100, plugin tailwind with `tailwindStylesheet` (verify option name), `tailwindFunctions: ["cn","cva"]`. `.prettierignore`.

## Vitest
- vitest 5.0.3 (peer vite ^6.4||^7||^8). Root `test.projects: ['packages/*','apps/*']` (`workspace` deprecated).
- Naming: `*.test.ts` unit; `*.int.test.ts` integration (real Postgres/Redis).
- Integration: globalSetup runs migrations on `novelhub_test`; `fileParallelism: false`; 30s timeouts; TRUNCATE ... CASCADE in beforeEach.
- Recommendation: `test` = unit, `test:int` = integration (decision needed). Env `node`. No coverage yet.

## Docker Compose (dev infra only; web/worker run on host in GĐ0)
- `postgres:18.6-alpine`, native `uuidv7()`; mount volume at `/var/lib/postgresql` (PG18 PGDATA change — verify); healthcheck `pg_isready`.
- `redis:8-alpine`; `--appendonly yes --appendfsync everysec --maxmemory-policy noeviction` (BullMQ requires noeviction); healthcheck `redis-cli ping`.
- `getmeili/meilisearch:v1.54`; `MEILI_MASTER_KEY` (≥16 bytes), `MEILI_ENV=development`, `MEILI_NO_ANALYTICS=true`; healthcheck curl/wget `/health` (verify tool in image).
- S3: see decision above; AWS SDK S3 client with `forcePathStyle` keeps backend swappable; one-shot bucket init.
- `x-logging` anchor json-file max-size 10m, max-file 3; `restart: unless-stopped`; bind `127.0.0.1:`.

## .env.example
NODE_ENV, APP_URL, POSTGRES_USER/PASSWORD/DB, DATABASE_URL, TEST_DATABASE_URL, REDIS_URL, MEILI_MASTER_KEY, MEILI_URL, S3_ENDPOINT/REGION/BUCKET/ACCESS_KEY_ID/SECRET_ACCESS_KEY/PUBLIC_URL/FORCE_PATH_STYLE, BETTER_AUTH_SECRET, BETTER_AUTH_URL, GOOGLE_CLIENT_ID/SECRET, SMTP_HOST/PORT/USER/PASS/FROM. Each with a description comment. Validate with one Zod env schema in `packages/shared`.

## BullMQ
- bullmq 6.3.11 (6.0.0 on 2026-07-30), ioredis 6.0.0 (optional peer; install yourself). Compat of BullMQ6+ioredis6 unverified → fallback ioredis 5.x (peer `>=5`).
- Worker conn: `maxRetriesPerRequest: null`. Producer conn (web): `enableOfflineQueue: false`. Two factories in one module.
- `packages/shared`: `QUEUE_NAMES`, job names, Zod payload schemas. Sample queue `system`, job `ping`.
- apps/worker: `src/index.ts` (connection, workers, shutdown), `src/processors/*.ts` pure functions with injected deps. Dev `tsx watch --env-file`.
- `defaultJobOptions.removeOnComplete/removeOnFail`. Error handlers.
- Graceful shutdown: SIGINT/SIGTERM → `worker.close()` → queues close → `connection.quit()`; 30s hard timeout.
- Schedulers: `queue.upsertJobScheduler(id, { every }, template)` at worker boot (idempotent). Not needed until Phase 2.
- Tests: unit call processor with fake job; integration real Redis, unique queue name, `job.waitUntilFinished(queueEvents)`, `obliterate({ force: true })`.

## Health
- Hono sub-app → `core.checkHealth()`. Postgres `select 1` + Redis `PING`, each ~2s timeout, `Promise.allSettled`.
- Dedicated Redis health connection: `enableOfflineQueue: false`, `commandTimeout: 2000`.
- 200 `{ status:'ok', checks:{ postgres:'up', redis:'up' } }` else 503; no error details leaked; `Cache-Control: no-store`.

## Unresolved
1. `pnpm test` unit-only vs include integration?
2. Dev S3: SeaweedFS / Garage / R2 dev bucket? (spec names MinIO)
3. Prod worker runtime tsx vs esbuild bundle (defer).
4. ioredis 6 vs 5 after smoke test.

Sources: https://pnpm.io/package_json · https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/ · https://vitest.dev/guide/projects · https://docs.bullmq.io/guide/going-to-production · https://docs.bullmq.io/guide/connections · https://docs.bullmq.io/guide/job-schedulers · https://github.com/minio/minio · https://rmoff.net/2026/01/14/alternatives-to-minio-for-single-node-local-s3/
