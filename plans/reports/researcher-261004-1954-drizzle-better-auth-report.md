# Research: Drizzle + Better Auth (Giai đoạn 0)

Date: 2026-10-04. Versions from `npm view`; behavior from reading installed source (`better-auth@1.7.7`, `drizzle-orm@0.45.3`) in scratch dir. No spike executed.

## Drizzle
- Pin `drizzle-orm@0.45.3`, `drizzle-kit@0.31.11`. 1.0 only rc (`1.0.0-rc.4`, stale since 2026-06). Do not start on rc.
- Avoid relations API (v1/v2 differ); use SQL-like `select().from().join()` → 1.0 upgrade later = `drizzle-kit up` + init change.
- Driver: `pg@8.23.1` + `@types/pg`, `drizzle-orm/node-postgres`. One Pool per process, capped `max`.
- `drizzle-kit generate` + `migrate()` from `drizzle-orm/node-postgres/migrator`; no `push`.

## UUIDv7
- Postgres 18 native `uuidv7()`. Helper `uuidPk()` = `uuid('id').primaryKey().default(sql\`uuidv7()\`)`. Image `postgres:18` (18.6 / 18-alpine). Verify `select uuidv7()` once.
- PG18 image: volume at `/var/lib/postgresql` (PGDATA = `/var/lib/postgresql/18/docker`).
- Rejected: app-side `uuid` pkg (extra dep, raw SQL misses), `crypto.randomUUID` (v4).

## Better Auth 1.7.7
- `@better-auth/cli` deprecated → `npx auth@latest generate` once into scratch, then hand-own tables in `packages/db/src/schema/auth.ts`.
- `drizzleAdapter(db, { provider: 'pg', schema, usePlural: true })`; adapter looks up tables by **JS key** (`users`, `sessions`, `accounts`, `verifications`). snake_case SQL names fine, no mapping.
- Runtime schema check at init logs mismatch.
- Required extra columns on `users` not in spec: `email` (unique), `email_verified`, `updated_at`; plus tables `sessions`, `accounts`, `verifications`.
- Map core fields: `user: { fields: { name: 'displayName', image: 'avatarUrl' } }`.
- `advanced.database.generateId: false` → DB default `uuidv7()` fills ids (adapter reads back via `.returning()`).
- `additionalFields`: `username` (string, unique, required:false at BA level, input:true), `role` (default 'reader', input:false), `status` (default 'active', input:false), `preferences` (json, input:false). `input:false` = privilege escalation guard.
- Username: own field, NOT username plugin (plugin allows changes, adds displayUsername dup). Zod rules (3–30, `[a-z0-9_]`, reserved), unique constraint, `databaseHooks.user.create.before` generates username for Google sign-ups, `databaseHooks.user.update.before` rejects username change. **Needs spike.**
- Email/password: `emailAndPassword: { enabled: true, requireEmailVerification, minPasswordLength }`, scrypt default. `emailVerification: { sendOnSignUp: true, sendVerificationEmail({ user, url, token }) }`; dev logs URL.
- **Decision:** spec says verification required before posting story/chapter/comment, not before login → recommend `requireEmailVerification: false` + gate writes in `core/policies` on `emailVerified`.
- Google: `socialProviders.google`; redirect `{baseURL}/api/auth/callback/google`. Google users arrive `emailVerified = true`.
- Hono mount: `app.on(['GET','POST'], '/api/auth/*', c => auth.handler(c.req.raw))`, before `/api/v1` middleware. Set `baseURL`, `trustedOrigins`.
- Session: `auth.api.getSession({ headers })`; type `typeof auth.$Infer.Session`.
- Ban: `databaseHooks.session.create.before` throw `APIError('FORBIDDEN')` when `status==='banned'`; session middleware re-checks status per request; keep `session.cookieCache` off. Ban service (later) deletes sessions.
- Admin plugin: NO (dup `banned`/`role`, impersonation YAGNI, bypasses moderation_actions).

## Seed
- Plain `tsx` script `packages/db` (`db:seed`), skip `drizzle-seed`.
- Order: tags → users → accounts → stories → story_tags → chapters → chapter_contents.
- Passwords: `hashPassword` from `better-auth/crypto`; insert `accounts` row `providerId: 'credential'`, `accountId = userId`, `password = hash`; `emailVerified: true`. Spike: sign in as seeded user.
- One user per role + muted + banned. Refuse when `NODE_ENV=production`. Idempotent (truncate dev or ON CONFLICT).
- public_id via the same app helper.

## Testing
- Compose Postgres, separate test DB, `globalSetup` creates DB + runs `migrate()`, `TRUNCATE ... RESTART IDENTITY CASCADE` between tests (table list from information_schema), `fileParallelism: false`, guard DB name ends `_test`.
- Rejected: tx-rollback per test (breaks BA/worker pools), testcontainers (extra dep).

## Unresolved
1. Verification gating at login vs writes only (product call; recommend writes only).
2. Required username + `user.create.before` for Google in 1.7.7 → spike.
3. Spec `users` table needs `email`, `email_verified`, `updated_at` + 3 auth tables.
4. `session.create.before` covers OAuth callback / refresh?
5. Drizzle 1.0 UUID column changes.

Sources: https://orm.drizzle.team/docs/upgrade-v1 · https://orm.drizzle.team/docs/get-started/postgresql-new · https://www.better-auth.com/docs/adapters/drizzle · https://www.better-auth.com/docs/integrations/hono · https://www.better-auth.com/docs/plugins/username · https://www.better-auth.com/docs/plugins/admin · https://github.com/docker-library/docs/pull/2582
