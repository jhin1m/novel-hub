# Research: TanStack Start + Hono + Tailwind v4 + Paraglide (Giai đoạn 0)

Date: 2026-10-04. Versions verified on npm. Nothing executed; shapes read from docs/type defs.

## Versions

| Package | Version | Note |
|---|---|---|
| `@tanstack/react-start` | 1.168.60 | 1.x, stable API |
| `@tanstack/react-router` | 1.170.41 | |
| `hono` | 4.13.13 | |
| `@hono/zod-validator` | 0.9.1 | peers hono>=4.11.2, zod ^3.25 \|\| ^4 |
| `zod` | 4.6.5 | |
| `tailwindcss` / `@tailwindcss/vite` | 4.3.3 | |
| `@inlang/paraglide-js` | 2.25.4 | |
| `vite` | 8.3.2 | Node ^20.19 or >=22.12 |
| `@vitejs/plugin-react` | 6.1.1 | |
| `nitro` | 3.0.260903-beta | only beta; pin exact |
| `tsx` | 4.23.15 | |
| `typescript` | pin `~6.0.3` | TS 7.0.2 is latest but typescript-eslint 8.71 peer `<6.1.0` |
| `@tanstack/react-query` | 5.104.1 | |

## TanStack Start scaffold (baseline: `examples/react/start-basic`)
- vite.config plugins order: `tailwindcss()`, `tanstackStart({ srcDirectory: 'src' })`, `viteReact()`, `nitro()`; `resolve: { tsconfigPaths: true }` (built into Vite 8).
- `src/router.tsx` exports `getRouter()` returning `createRouter({ routeTree, scrollRestoration: true })`.
- `routeTree.gen.ts` generated; decide commit vs gitignore.
- `__root.tsx`: `createRootRoute`, `HeadContent`, `Scripts`, `Outlet`; CSS via `import appCss from '../styles/app.css?url'`.
- Scripts: `dev: vite dev`, `build: vite build`, `start: node .output/server/index.mjs`.
- Server fn: `createServerFn({ method }).validator(schema).handler(...)` (`.inputValidator` deprecated in 1.170 types).
- Server routes: `createFileRoute(path)({ server: { handlers } })`. `createServerFileRoute` removed. Methods include `ANY`.
- Catch-all: `src/routes/api/$.ts` → `createFileRoute('/api/$')({ server: { handlers: { ANY: ({ request }) => app.fetch(request) } } })`. Hono app uses `basePath('/api')` so no path stripping. Smoke-test OPTIONS/HEAD.

## Hono / hc
- Sub-app per domain, chained `.get().post()` (required for inference). Root: `new Hono().basePath('/api/v1').route('/health', health)...`; `export type AppType = typeof app`.
- Note: if the Better Auth handler lives at `/api/auth/*`, root must be `basePath('/api')` with `/v1` sub-routes, or a separate splat route `routes/api/auth/$.ts`.
- Validation: wrap `zValidator(target, schema, hook)` in one `zv()` helper returning `c.json({ error: { code: 'VALIDATION', message } }, 400)` on failure. Unverified whether hook 400 enters hc type.
- Typed errors: always literal status `c.json({...}, 404)`. Global `onError`/`notFound` not in route types → `ApplyGlobalResponse<typeof app, { 500: ... }>`.
- TS: `strict: true` everywhere; JIT source packages, `noEmit`, `moduleResolution: Bundler`; do NOT set `declaration` (TS2742 risk).
- Compile perf: `hcWithType = (...args: Parameters<typeof hc>): Client => hc<AppType>(...args)`.

## hc server vs client
- Browser: `hcWithType(location.origin)`; inside TanStack Query for personalized, uncached data.
- SSR public data: prefer `createServerFn` → `core` directly (no self-fetch).
- If SSR must use hc: `hc<AppType>('http://localhost', { fetch: (i, init) => app.request(i, init) })`.
- Tests: `testClient(app)` from `hono/testing`.

## Tailwind v4
- `tailwindcss` + `@tailwindcss/vite`; `src/styles/app.css` with `@import "tailwindcss";`; no tailwind.config; tokens via `@theme`/CSS vars.
- shadcn/ui deferred to Giai đoạn 1.

## Paraglide
- Full wiring (custom server.ts + paraglideMiddleware + router rewrite) interacts with beta Nitro. Single locale `vi` → `strategy: ['baseLocale']`, no URL prefix.
- Inlang plugin modules loaded from CDN in example → offline/CI build risk (unverified).
- Recommendation: defer out of Giai đoạn 0 (no UI strings yet); do first in Giai đoạn 1.

## Workspace packages
- JIT TS source: `"type":"module"`, `"exports": {".": "./src/index.ts"}`, `workspace:*`.
- Vite SSR: workspace pkgs resolve outside node_modules → bundled; smoke-test, fallback `ssr.noExternal`.
- Worker: `tsx watch src/index.ts` dev; tsx in prod acceptable (no bundling in GĐ0).
- Built packages + project refs rejected (overhead, TS2742).

## Unresolved
1. Vite 8 SSR + Nitro bundles workspace pkgs without `ssr.noExternal`?
2. zValidator hook 400 in hc type? `fail()` helper keeps literal status?
3. `ANY` forwards OPTIONS/HEAD?
4. Paraglide offline builds?
5. `app.request(Request)` accepted; request-headers getter name in `@tanstack/react-start/server`?
6. Nitro beta production readiness.

Sources: https://tanstack.com/start/latest/docs/framework/react/build-from-scratch · https://tanstack.com/start/latest/docs/framework/react/guide/hosting · https://hono.dev/docs/guides/rpc · https://hono.dev/docs/helpers/testing · https://github.com/honojs/middleware/tree/main/packages/zod-validator · https://tailwindcss.com/docs/installation/framework-guides/tanstack-start · https://paraglidejs.com/tanstack-start · https://mastra.ai/reference/server/tanstack-start-adapter
