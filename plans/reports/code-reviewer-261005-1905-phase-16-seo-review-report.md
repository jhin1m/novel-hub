# Code review: phase 16, SEO (metadata, Open Graph, sitemap, canonical)

Date: 2026-10-05 · Scope: uncommitted diff + untracked files listed in the task · Score: **8/10**

## Verified (evidence, not assumed)

- Canonical, sitemap URLs and 301 targets all come from `canonicalPath()` (`packages/shared`). Every route that calls `assertCanonical` passes the same target to `seo()`.
- `head()` reads only loader data and root loader data via `siteConfig(matches)`, never `window` or env. Root `loaderData` is dehydrated, so SSR and client heads match.
- TanStack dedupe (`react-router/dist/esm/headContentUtils.js:13-36`): the deepest match wins for each `name`/`property`, and links are not deduped by `rel`. The root emits no canonical, so pages never get two.
- `X-Robots-Tag` and cache headers are unchanged (`publicPageHeaders`). The 18+ story and chapter pages emit `noindex` and drop the canonical tag.
- Root `failed` flag: router-core `projectLane` (server `load-server.js:371`, client `load-client.js:578`, start=0) runs heads after loading finishes, so match statuses are final. 404/500 pages get `noindex`.
- Sitemap conditions match the page conditions:
  - Stories: `publicStoryWhere({includeMature:false})`, the same filter the story pages use (`isStoryPubliclyVisible`).
  - Chapters: the SQL filter plus `canReadChapter(null, …)`.
  - Authors: `lastChapterAt IS NOT NULL` plus a non-banned author, matching the 404 rule in `getAuthorPage`.
  - Tags: merged tags are folded into their canonical tag through `followMerges`, matching `mergedInto` on the tag page.
- No leftover `appUrl` consumers of `getStoryPage/getAuthorPage/getTagPage/getHomePage/getChapterPage` (grep). `ChapterPageData.coverUrl` is additive.
- No `Host` header use; the origin always comes from `env.APP_URL`. XML escapes `& < > " '`. Head values pass through React attributes, with no raw HTML.
- Client bundle is clean: I ran `vite build` in a scratchpad clone and grepped `.output/public` for `listSitemap|renderUrlset|seo-routes|getInfra|ioredis|drizzle-orm|createDb`. No matches.
- All 20 page routes have a `seo()` head. The only `createFileRoute` files without one are server-only: `api/$`, robots and the sitemaps.

## Critical

None.

## High

None.

## Medium

**M1. Cover pages advertise the wrong OG image size.** Code: `apps/web/src/lib/seo.ts:65-77` together with `apps/web/src/routes/__root.tsx:69-80`.
- The root default emits `og:image:width=1200` and `og:image:height=630` for the default image. A leaf with a cover emits `og:image` and `twitter:card`, but no width or height.
- Dedupe keeps the root's dimensions. Probe output for a story with a cover: `og:image=…c-600.webp`, `og:image:width=1200`, `og:image:height=630`. The dimension tags also come before `og:image`.
- Scenario: Facebook or Zalo uses the declared 1200×630 to lay out the preview before fetching the image, so the 600×900 cover is cropped or distorted.
- Fix: in the cover branch, emit the cover's own dimensions from the cover spec in `packages/shared/src/limits.ts` (600×900), after `og:image`. Alternatively, have the root not emit dimension tags. Add a unit or e2e case for a story with a cover; none exists today.

**M2. Sitemap and robots responses are not cached by the CDN, and their cache comment overstates it.** Code: `apps/web/src/server/seo-routes.ts:17-20`, `docs/deployment-cloudflare.md:26-36`.
- The `public-html` Cache Rule only covers `/`, `/stories/`, `/authors/`, `/tags/`, `/terms` and `/content-policy`. Cloudflare does not cache `.xml` by default.
- So `s-maxage=3600` has no effect, and the comment "An hour at the CDN" is false as deployed.
- Every `/sitemap.xml` hit runs two `count()` joins, and every child sitemap runs a 10k-row join with `OFFSET`.
- `/sitemap/chapters/999999999` passes the regex (`^[1-9]\d{0,8}$`). It forces an `OFFSET` near 1e13, which scans to the end of the table. It can be requested anonymously in a loop.
- The phase's own risk table says to add `/sitemap*` and `/robots.txt` to the rule. That was not done.
- Fix:
  - Add `http.request.uri.path in {"/sitemap.xml" "/robots.txt"} or starts_with(http.request.uri.path, "/sitemap/")` to the Cache Rule doc.
  - Optionally reject `page > ceil(count / pageSize)` before running the list query, which bounds the work for junk page numbers.

**M3. 18+ cover and synopsis reach social previews without the 18+ screen.** Code: `apps/web/src/routes/stories.$storyKey.index.tsx:40-44` and `stories.$storyKey.chapter-{$number}.tsx:410-412` (`image: story.coverUrl`, description from the synopsis or story title).
- Spec section 7 puts every direct view of 18+ content behind the warning screen.
- A shared link renders the unblurred cover and synopsis in Messenger, Zalo, Discord and similar apps, with no gate.
- `noindex` does not affect link unfurlers.
- Fix, which needs product intent: use `image: story.isMature ? null : story.coverUrl`, which gives the default OG image, plus a neutral description for 18+ pages. See the unresolved questions.

## Low

**L1. Every page now depends on full infra init.** Code: `apps/web/src/server-fns/site-config.ts:8`, root loader.
- `getSiteConfig` calls `getInfra()`, which builds the Postgres pool, Redis connections and BullMQ queue, waiting up to 2 s for Redis.
- `/terms`, `/sign-in` and other pages that did not use infra before now 500 if infra init throws, for example on a bad env.
- Fix: parse only `appEnvSchema` (`APP_URL`) in this server fn, or reuse the env without creating connections.

**L2. Empty list pages can be indexed.** Code: `apps/web/src/routes/tags.$tagSlug.tsx:38-49`, `authors.$username.tsx:28-39`.
- A tag page with `totalPages < page <= lastPage`, where the remaining stories are 18+ only, returns 200 with an empty grid in the cached HTML and a self-canonical.
- An author page whose public stories are all 18+ also renders an empty list and is indexable.
- Search engines treat these as soft-404 or thin pages. The sitemap excludes them, but internal pagination links lead crawlers there.
- Fix: `noindex: stories.items.length === 0` in both heads (SSR lists never include 18+ stories, so this is deterministic).

**L3. A staging server built for production gets indexed.** Code: `apps/web/src/server/seo-routes.ts:43` (`env.NODE_ENV === 'production'`).
- A staging or homelab copy run as a production build serves `Allow: /` with a sitemap of staging URLs, and its pages have no `noindex`.
- Fixing this needs an explicit env flag, which is a config change and needs user approval. Until then, document the constraint.

**L4. Test-only knobs added to the core public API.** Code: `packages/core/src/index.ts:715-729`.
- `SitemapPaging` (a test-only `pageSize` knob) and `escapeXml` are exported from the core index but used only inside core or tests.
- Not harmful, but it widens the API. Keep them as module-level exports only.

**L5. The pages sitemap has no URL cap.** Code: `packages/core/src/seo/sitemap.ts:64-99`.
- `listSitemapPages` returns home, static pages, all tags and all authors with no limit.
- Past 50,000 authors the file breaks the sitemaps.org limit. This is a year-one non-issue; add a note or paginate authors when needed.

## Task completeness (phase file)

- Requirements, function checklist and test matrix are all implemented.
- The sourcemap/bundle check (step 8) is verified clean by my build probe.
- The spec checkbox `docs/project-spec.md:165` is still `[ ]`, and the phase file still says `status: pending`. The lead should update both once the M items are decided.
- The Cloudflare doc update is missing (see M2).

## Recommended actions

1. M1: add cover dimensions in `seo()` plus a test for a story with a cover.
2. M2: extend the Cache Rule doc and optionally bound the page number by the count.
3. M3: confirm product intent for 18+ OG previews, then apply the default image and a neutral description.
4. L1 and L2: cheap fixes, worth folding into the same change.

## Unresolved questions

- M3: may an 18+ story's cover and synopsis appear in link previews, or should 18+ pages use the default OG image and a neutral description?
- L3: should robots and indexing be controlled by an explicit env flag (for example, indexing allowed only on the real domain) instead of `NODE_ENV`? This is a config change and needs approval.
