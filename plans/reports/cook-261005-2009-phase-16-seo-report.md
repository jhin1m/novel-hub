# Cook report — Phase 16: SEO (metadata, OG, sitemap, canonical)

Date: 2026-10-05 · Plan: `plans/261004-1654-giai-doan-1-doc-va-viet/phase-16-seo-metadata-sitemap.md`

## Status: DONE (2026-10-05 20:40)

Final gate after Docker recovered: `typecheck`, `lint`, `test` (597), `test:int` (300 passed, 1 skipped S3), `test:e2e` (71 passed). Plan, phase file and spec checkbox updated.

### History (infra block, resolved)

- Green: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` (92 files / 597 tests), after review fixes.
- Green **before** review fixes: `pnpm test:int` (40 files, 300 passed, 1 skipped S3) and `e2e/seo.spec.ts` (8/8).
- **Not run after review fixes: `pnpm test:int`, `pnpm test:e2e` (full).** After the machine slept, OrbStack's Docker engine hung: `docker ps` never returns, Postgres (5432) accepts TCP but never answers, and `orb restart docker` hung for more than 10 minutes (killed). The e2e web server timed out on `/api/v1/health` (postgres/redis down). Fixing it needs a person: restart the OrbStack app (or the Mac). That also restarts containers of other projects (mariadb, redis), so it was not done automatically.
- Docker came back on its own about 30 minutes later; the full gate then passed.

## What changed

- `apps/web/src/lib/seo.ts` (+ test): `seo()` builds title `{t} · Novel Hub`, description (`metaDescription`, 160 chars, no split surrogate), `og:*`, Twitter card, canonical (omitted when `noindex`), `robots`; image always with its size (cover 600×900, default 1200×630). `siteConfig(matches)` reads root loader data.
- `apps/web/src/server-fns/site-config.ts`: `getSiteConfig` reads only `APP_URL` (`loadServerEnv(appEnvSchema)`, memoized); root loader with `staleTime: Infinity`.
- `__root.tsx`: default meta (`og:site_name`, `og:locale=vi_VN`, default description/image); `noindex` when any match is not `success` (404, error).
- Public routes (`/`, story, chapter, author, tag, `/terms`, `/content-policy`): head via `seo()` + `canonicalPath()`. 18+ story/chapter: `noindex` (+ existing `X-Robots-Tag`). Empty author page (only 18+) and empty tag page: `noindex`. `/terms`, `/content-policy` now have canonical + description (phase 10 note).
- Private routes (`/search`, `/library`, `/settings`, `/moderation`, `/write/**`, sign-in/up, forgot/reset password): `seo({ noindex: true })`.
- `appUrl` removed from page server fns (`catalog.ts`, `reader.ts`); single source = root loader. Chapter data gained `story.coverUrl` (additive).
- Core `packages/core/src/seo/{xml,sitemap}.ts` (+ unit, int tests): `renderUrlset`, `renderSitemapIndex`, `renderRobots`, `countSitemap`, `listSitemapPages|Stories|Chapters`, `SITEMAP_PAGE_SIZE=10000`. Stories via `publicStoryWhere({ includeMature: false })`, chapters re-checked with `canReadChapter(null, …)`, tags resolved through `followMerges` (now exported from `tag-page.ts`), authors only with a listed story. Page 1 always exists; out-of-range → `null`.
- Server routes: `/robots.txt`, `/sitemap.xml`, `/sitemap/pages`, `/sitemap/stories/$page`, `/sitemap/chapters/$page` → `apps/web/src/server/seo-routes.ts` (page param strict `^[1-9]\d{0,8}$`; 404 text cached 60 s).
- `eslint.config.js`: browser-import rule exempts `routes/robots*.ts`, `routes/sitemap*.ts`, `routes/sitemap/**` (config change — lint scope only).
- `apps/web/public/og-default.png` 1200×630 (Be Vietnam Pro 600 "Novel Hub" on `#FBF8F3`, terracotta `#A8432A` bar), rendered once with Playwright Chromium from a scratch script (not committed).
- `vi.json`: `reader_page_description`, `reader_page_description_titled`, `author_page_description`. Terms/policy descriptions reuse `terms_intro`/`rules_intro`.
- `docs/deployment-cloudflare.md`: sitemap/robots rows + added to Cache Rule expression.
- `e2e/seo.spec.ts` (new), `e2e/reader.spec.ts` title now ends `· Novel Hub`.
- Client bundle check: build with `--sourcemap` → 65 maps, none contain `packages/core`, `packages/db`, `pg`, `ioredis`, `drizzle-orm`.

## Route audit (`createFileRoute`)

Index/canonical: `/`, `/stories/$storyKey/` (noindex if 18+), `/stories/$storyKey/chapter-{$number}` (noindex if 18+), `/authors/$username` (noindex if empty), `/tags/$tagSlug` (noindex if empty page), `/terms`, `/content-policy`. Noindex: `/search`, `/library`, `/settings`, `/moderation`, `/write/`, `/write/stories/new`, `/write/stories/$publicId/`, `/write/stories/$publicId/chapters/$number`, `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`, 404/error (root). Server-only: `/api/$`, robots, sitemaps.

## Review (`code-reviewer-261005-1905-phase-16-seo-review-report.md`, 8/10, 0 Critical/High)

- M1 cover pages kept the default 1200×630 size → fixed (size per image + test).
- M2 sitemap/robots not in the Cloudflare Cache Rule → doc fixed. A deep `?page` still scans to the end on a cache miss; the count check would cost the same, so left to CDN caching.
- M3 18+ cover/synopsis show in link previews (Zalo/Messenger) → **not changed, product decision**.
- L1 `getSiteConfig` started the whole infra → fixed. L2 empty lists indexable → fixed. L4 `escapeXml` exported from core index → removed. L3 robots keyed on `NODE_ENV` → needs an env flag (config change), not done. L5 pages sitemap > 50k URLs → not a year-one concern.

## Unresolved questions

1. M3: should 18+ pages use the default image and a neutral description in `og:*` (hide cover/synopsis in link previews)?
2. L3: add an explicit env flag (e.g. `ALLOW_INDEXING`) instead of `NODE_ENV` for robots.txt? (env change needs approval)
