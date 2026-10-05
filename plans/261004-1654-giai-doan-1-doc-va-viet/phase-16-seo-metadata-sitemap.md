---
phase: 16
title: "Phase 16: SEO: metadata, Open Graph, sitemap, canonical"
status: pending
priority: P1
effort: "1.5d"
dependencies: [15]
---

# Phase 16: SEO: metadata, Open Graph, sitemap, canonical

Spec checkbox: `SEO: metadata, Open Graph, sitemap, canonical URL.`

## Context Links

- Spec mục 4 (URL, slug, 301, canonical luôn dùng slug hiện tại, tag gộp 301), mục 6 (cache công khai), mục 7 (truyện 18+ không vào sitemap, `noindex`), mục 10 (sitemap phải đi qua `canReadChapter`)
- [plan.md](./plan.md) — trang công khai lấy dữ liệu bằng server fn, cache header ở route lá, không route công khai nào đụng cookie; "URL chuẩn duy nhất" (301 khi path không viết thường hoặc query ngoài allowlist, tag chỉ cho `page`); "Ban" (lọc `users.status <> 'banned'` ở mọi truy vấn công khai, gồm sitemap)
- `plans/reports/researcher-261004-2352-tanstack-start-ssr-ui-report.md` mục 3 (`head({ loaderData })`, `APP_URL` qua loader data, `routes/sitemap[.]xml.ts`, phân trang `/sitemap/stories/$page`)
- Code: `apps/web/src/routes/__root.tsx:7-16` (head gốc chỉ có charset, viewport, title), `apps/web/src/routes/api/$.ts` (mẫu server route), `eslint.config.js` (rule chặn import server, miễn `src/server/**`, `src/routes/api/**`), `apps/web/playwright.config.ts:24` (e2e chạy `vite dev`)
- Phase 7 (trang chương, `canReadChapter`, header cache, `canonicalPath` ở `packages/shared/src/canonical-path.ts` + `assertCanonical` (301), `head()` cơ bản), phase 10 (trang truyện/tác giả/tag/chủ, `publicStoryWhere`, `/terms`, `/content-policy`, 18+), phase 11 (`/search`), phase 12 (`/library`), phase 15 (`/moderation`)

## Overview

- Helper `seo()` dựng `meta` + `links` cho `head()`: title, description, canonical tuyệt đối, Open Graph, Twitter card, `robots`.
- `APP_URL` tới `head()` qua root loader (server fn `getSiteConfig`), không đọc env ở client.
- Audit mọi route công khai và riêng tư: hoàn thiện meta, đặt `noindex` đúng chỗ.
- `/robots.txt`, `/sitemap.xml` (index) + `/sitemap/pages`, `/sitemap/stories/$page`, `/sitemap/chapters/$page`.
- OG image mặc định (file tĩnh); truyện có bìa dùng bìa.

## Key Insights

- `head()` chạy cả server và client; dữ liệu cần cho canonical phải nằm trong loader data để HTML SSR và client khớp nhau. Root loader trả `{ appUrl, siteName }` một lần (`staleTime: Infinity`); route con đọc qua `matches` hoặc `useRouteContext`/loader data của root. Server fn của trang chỉ trả **path** canonical (ví dụ `/stories/kiem-dao-k7m2xq9p`, dựng bằng `canonicalPath`), `seo()` ghép với `appUrl`.
- `loaderData` có thể `undefined` khi loader throw (404) → `seo()` chịu được input thiếu, trang lỗi có `noindex`.
- Canonical không bao giờ lấy từ URL request (tránh slug sai, query rác, host lạ): luôn dựng từ dữ liệu DB, bằng **`canonicalPath(target)`** của phase 7 — cùng hàm `assertCanonical` dùng làm đích 301 và `urlsFor` dùng để purge (không viết hàm thứ hai; core import được vì nằm ở `packages/shared`). Nhờ đó URL trong `<link rel=canonical>`, sitemap và đích 301 luôn trùng nhau: chữ thường, không query trừ `?page=N` (N > 1) ở trang tag. <!-- Red Team: cache variants -->
- Sitemap không tự viết điều kiện "công khai": truyện lọc bằng `publicStoryWhere({ includeMature: false })` của phase 10 (visibility `published`, tác giả không `banned`, không 18+), nên tự loại nội dung của tác giả bị ban. <!-- Red Team: ban mechanism -->
- Sitemap là server route trả XML; các file này import `apps/web/src/server/*` nên thêm vào `ignores` của rule ESLint như `routes/api/**`, và kiểm lại sourcemap client không chứa `packages/core`/`db` (cách làm phase 4 Giai đoạn 0).
- Mọi chương trong sitemap phải qua `canReadChapter(null, chapter)` (spec mục 10) — SQL lọc trước cho nhanh, JS gọi `canReadChapter` để giữ bất biến một-điểm-quyết-định.
- Trang 18+ thêm `X-Robots-Tag: noindex` trong `headers()` cạnh meta (HTML vẫn giống nhau cho mọi người, cache công khai được).
- `robots.txt` chặn `/api/`, `/write`, `/moderation`; các trang khác cần `noindex` dùng meta (nếu chặn crawl thì crawler không thấy `noindex`). Môi trường không phải production → `Disallow: /`.

## Requirements

**Functional**

- `seo(input)` với `{ appUrl, path, title, description?, image?, type?: 'website' | 'article' | 'book', noindex? }` trả:
  - `title` dạng `{title} · {siteName}` (trang chủ chỉ `siteName`);
  - `description` (cắt 160 ký tự, gộp khoảng trắng);
  - `og:title`, `og:description`, `og:url` (= canonical), `og:type`, `og:image` (tuyệt đối), `og:site_name`, `og:locale = vi_VN`;
  - `twitter:card`: `summary` khi có bìa, `summary_large_image` khi dùng ảnh mặc định;
  - `link rel=canonical` tuyệt đối (bỏ khi `noindex`);
  - `meta robots noindex` khi `noindex`.
- Bảng audit (canonical path, ảnh, robots):

| Route | Canonical | OG image | Robots |
|---|---|---|---|
| `/` | `/` | mặc định | index |
| `/stories/{slug}-{id}` | slug hiện tại | bìa 600×900 hoặc mặc định | `noindex` nếu `is_mature` |
| `/stories/…/chapter-{n}` | slug hiện tại | như truyện | `noindex` nếu truyện `is_mature` |
| `/authors/{username}` | `/authors/{username}` | mặc định (avatar sau này) | index |
| `/tags/{slug}` | slug chuẩn, giữ `?page=N` khi N > 1 | mặc định | index |
| `/terms`, `/content-policy` | chính nó | mặc định | index |
| `/search`, `/library`, `/settings`, `/write/**`, `/moderation`, `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`, trang 404 | — | — | `noindex` |

- Description: truyện = synopsis; chương = mẫu i18n "Đọc chương {n}: {title} – {story} của {author}" (không parse nội dung); tác giả = bio hoặc mẫu; tag = mẫu "Truyện {tag}"; trang chủ = mẫu.
- `/robots.txt`: production → `Allow: /`, `Disallow: /api/`, `/write`, `/moderation`, dòng `Sitemap: {APP_URL}/sitemap.xml`; khác production → `Disallow: /`. `text/plain`, cache `public, s-maxage=86400`.
- `/sitemap.xml` (sitemapindex) liệt kê `/sitemap/pages`, `/sitemap/stories/1..N`, `/sitemap/chapters/1..M`; mỗi file tối đa `SITEMAP_PAGE_SIZE = 10000` URL.
  - `pages`: `/`, `/terms`, `/content-policy`, tag chuẩn (`canonical_id IS NULL`) có ít nhất một truyện thoả `publicStoryWhere({ includeMature: false })`, tác giả có ít nhất một truyện như vậy (tác giả bị ban tự bị loại).
  - `stories`: truyện thoả `publicStoryWhere({ includeMature: false })`; `lastmod = greatest(updated_at, last_chapter_at)`.
  - `chapters`: chương `published`, `deleted_at IS NULL`, truyện thoả điều kiện trên, rồi qua `canReadChapter(null, …)`; `lastmod = updated_at`.
  - `SitemapEntry.path` dựng bằng `canonicalPath` (phase 7): `{ kind: 'home' | 'static' | 'tag' | 'author' | 'story' | 'chapter' }`.
  - Thứ tự ổn định theo `id` (UUIDv7); `$page` ngoài phạm vi hoặc không phải số nguyên dương → 404.
  - `application/xml; charset=utf-8`, `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`, không `Set-Cookie`.
- OG image mặc định `apps/web/public/og-default.png` 1200×630: bản tối giản — chữ "Novel Hub" (Be Vietnam Pro) màu `--foreground` trên nền `--background` `#FBF8F3`, một vạch màu nhấn đất nung `#A8432A`; không thêm hoạ tiết. Sinh một lần bằng `sharp` từ SVG (script tạm, không commit) hoặc dựng tay, commit file PNG. <!-- Updated: Validation Session 1 - OG tối giản -->

**Non-functional**

- Sitemap trang nặng nhất (10.000 chương) < 1 s trên dữ liệu seed lớn; dùng index sẵn có (`chapters_story_id_status_number_idx`, `stories_visibility_last_chapter_at_idx`).
- Không thêm dependency; XML dựng bằng template string + hàm escape.

## Architecture

```
__root.tsx  loader: getSiteConfig() → { appUrl, siteName }   (createServerFn GET, đọc APP_URL ở server)
route lá    loader: getXxxPage() → { ..., seo: { path: canonicalPath(…) (phase 7), title, description, image, isMature } }
            head: ({ loaderData, matches }) => seo({ appUrl: rootData(matches).appUrl, ...loaderData.seo })
            headers: 18+ → X-Robots-Tag: noindex
routes/robots[.]txt.ts            ─▶ server/seo-routes.ts ─▶ text
routes/sitemap[.]xml.ts           ─▶ core.seo.countSitemap(db) → sitemapindex
routes/sitemap/pages.ts           ─▶ core.seo.listSitemapPages(db)
routes/sitemap/stories/$page.ts   ─▶ core.seo.listSitemapStories(db, page)      WHERE publicStoryWhere({ includeMature: false })
routes/sitemap/chapters/$page.ts  ─▶ core.seo.listSitemapChapters(db, page)     cùng điều kiện truyện → filter canReadChapter(null, …)
```

```ts
// apps/web/src/lib/seo.ts (isomorphic, không import server)
export interface SeoInput { appUrl: string; path?: string; title?: string; description?: string;
  image?: string | null; type?: 'website' | 'article' | 'book'; noindex?: boolean }
export function seo(input: SeoInput): { meta: HeadMeta[]; links: HeadLink[] };
export function absoluteUrl(appUrl: string, pathOrUrl: string): string;

// packages/core/src/seo/sitemap.ts
export const SITEMAP_PAGE_SIZE = 10_000;
export interface SitemapEntry { path: string; lastmod: Date | null }
export async function countSitemap(db: Db): Promise<{ storyPages: number; chapterPages: number }>;
export async function listSitemapPages(db: Db): Promise<SitemapEntry[]>;
export async function listSitemapStories(db: Db, page: number): Promise<SitemapEntry[] | null>; // null = ngoài phạm vi
export async function listSitemapChapters(db: Db, page: number): Promise<SitemapEntry[] | null>;
// packages/core/src/seo/xml.ts
export function renderUrlset(appUrl: string, entries: SitemapEntry[]): string;
export function renderSitemapIndex(appUrl: string, paths: string[]): string;
export function renderRobots(appUrl: string, production: boolean): string;
```

## File Inventory

| File | Action | Ghi chú |
|---|---|---|
| `apps/web/src/lib/seo.ts` (+ `.test.ts`) | create | |
| `apps/web/src/server-fns/site-config.ts` | create | `getSiteConfig` |
| `apps/web/src/routes/__root.tsx` | modify | loader + `staleTime: Infinity`; meta mặc định (`og:site_name`, `og:locale`), `noindex` cho `notFoundComponent`/`errorComponent` |
| route công khai phase 7/10 (`stories.*`, `authors.*`, `tags.*`, `index`, `terms`, `content-policy`) + server fn tương ứng | modify | `head` dùng `seo()`, server fn trả `seo` có `path = canonicalPath(…)` (phase 7) |
| route riêng tư (`search`, `library`, `settings`, `write.*`, `moderation`, auth) | modify | `seo({ noindex: true, title })` |
| `packages/core/src/seo/{sitemap,xml}.ts` (+ `xml.test.ts`, `sitemap.int.test.ts`) | create | import `publicStoryWhere` (phase 10), `canReadChapter`, `canonicalPath` (phase 7), không tự viết điều kiện công khai hay dựng path |
| `packages/core/src/index.ts` | modify | export |
| `apps/web/src/server/seo-routes.ts` | create | handler dùng chung (lấy `db`, `env` từ `infra.ts`) |
| `apps/web/src/routes/robots[.]txt.ts`, `sitemap[.]xml.ts`, `sitemap/pages.ts`, `sitemap/stories/$page.ts`, `sitemap/chapters/$page.ts` | create | server route `GET` |
| `eslint.config.js` | modify | thêm các file route sitemap/robots vào `ignores` của rule chặn import (đổi config lint — nêu trong báo cáo cook) |
| `apps/web/public/og-default.png` | create | 1200×630, bản tối giản từ tokens |
| `packages/shared/messages/vi.json` | modify | mẫu description |
| `apps/web/e2e/seo.spec.ts` | create | |
| `apps/web/src/routeTree.gen.ts` | regenerate | |

## Implementation Steps

1. `seo()` + `absoluteUrl()` thuần, unit test đủ các nhánh (thiếu description, có/không ảnh, `noindex` bỏ canonical, cắt 160 ký tự không cắt giữa cặp surrogate).
2. `getSiteConfig` + root loader; kiểm client navigation không gọi lại server fn (`staleTime: Infinity`, xem tab Network).
3. Route công khai: server fn trả block `seo` có `path = canonicalPath(…)` dựng từ DB (slug hiện tại, tag chuẩn, `page` → `?page=N` khi N > 1) — cùng giá trị loader đưa vào `assertCanonical`; thay head cũ bằng `seo()`. Truyện/chương 18+: `noindex` + `X-Robots-Tag`. Giữ nguyên `headers` cache và helper 301 của phase 7/10.
4. Route riêng tư và trang lỗi: `noindex`. Grep `createFileRoute(` trong `apps/web/src/routes` để chắc không sót; ghi danh sách vào báo cáo cook.
5. Core `xml.ts`: escape `& < > " '`, `lastmod` ISO 8601 UTC, URL tuyệt đối; unit test.
6. Core `sitemap.ts`: các truy vấn theo Requirements, điều kiện truyện luôn là `publicStoryWhere({ includeMature: false })`; chương lọc lại bằng `canReadChapter(null, row)`; int test với dữ liệu đủ trạng thái (gồm tác giả bị ban).
7. Server route + `seo-routes.ts`; `$page` parse bằng Zod `z.coerce.number().int().positive()`; header theo Requirements; 404 XML-less (text) với cache ngắn.
8. ESLint `ignores`; build client rồi kiểm sourcemap như phase 4 Giai đoạn 0 (không có `packages/core`, `packages/db`, `pg`, `ioredis`).
9. OG image mặc định đặt vào `public/`; kiểm `curl -I /og-default.png`.
10. E2E `seo.spec.ts`; kiểm thêm bằng tay một trang truyện qua công cụ xem trước OG (ví dụ dán URL vào trình debug của mạng xã hội khi đã có domain) — ghi chú, không bắt buộc ở dev.
11. Gate: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e`. Đánh `[x]` checkbox "SEO: metadata…" trong spec.

## Function / Interface Checklist

- [ ] `seo(input)`, `absoluteUrl(appUrl, path)`
- [ ] `getSiteConfig` (server fn)
- [ ] `countSitemap`, `listSitemapPages`, `listSitemapStories`, `listSitemapChapters`, `SITEMAP_PAGE_SIZE`
- [ ] `renderUrlset`, `renderSitemapIndex`, `renderRobots`

## Test Scenario Matrix

| Mức | Kịch bản | Loại |
|---|---|---|
| Critical | `seo()` sinh canonical tuyệt đối, `og:url` = canonical, `noindex` không có canonical | unit |
| High | Description dài/xuống dòng → gộp và cắt 160; ký tự `"` `<` được giữ nguyên để React escape | unit |
| Critical | XML escape và `lastmod` UTC; sitemapindex đúng số trang | unit `xml.test.ts` |
| Critical | Sitemap truyện loại: draft, `hidden_by_mod`, `is_mature`, truyện của tác giả `banned`; có truyện published thường | int `sitemap.int.test.ts` |
| Critical | Sitemap chương loại: draft, scheduled, `hidden_by_mod`, xoá mềm, chương của truyện bị ẩn/18+/tác giả bị ban | int |
| High | Tag bị gộp không có trong `pages`; tác giả chỉ có truyện 18+ hoặc bị ban không có; bỏ ban → trở lại | int |
| High | URL trong sitemap và canonical trùng đích 301 của `assertCanonical` (cùng `canonicalPath`; chữ thường, trang tag dùng `?page=`) | unit + e2e |
| High | Trang sitemap ngoài phạm vi → `null`; `/sitemap/stories/0`, `/sitemap/stories/abc` → 404 | int + e2e |
| Critical | `GET /sitemap.xml` → 200, `application/xml`, `cache-control` public, không `set-cookie`, chứa link `/sitemap/stories/1` | e2e |
| Critical | Trang truyện thường: `link[rel=canonical]` tuyệt đối với slug hiện tại khi truy cập bằng slug sai (sau 301), có `og:title`, `og:image`, `meta description` | e2e |
| Critical | Trang truyện 18+: `meta robots noindex` + header `x-robots-tag` | e2e |
| High | `/search`, `/sign-in`, `/write` có `noindex`; `/robots.txt` khác production có `Disallow: /` | e2e |
| High | HTML SSR (JS tắt) đã có đủ meta trong `<head>` | e2e |
| Medium | Sourcemap client sạch sau khi thêm server route | thủ công (step 8) |

## Dependency Map

- Cần: phase 2 (`infra.ts`), phase 7 (`canReadChapter`, route chương, `canonicalPath` + `assertCanonical`), phase 10 (route công khai + server fn, `publicStoryWhere`, trang điều khoản), phase 11/12/15 (route riêng tư để gắn `noindex`).
- Phase 17 không phụ thuộc. Giai đoạn 2: thêm avatar vào OG trang tác giả khi có upload avatar.

## Success Criteria

- [ ] Mọi route công khai có title, description, canonical tuyệt đối, Open Graph, Twitter card
- [ ] Mọi route riêng tư, tìm kiếm, trang 18+ có `noindex`
- [ ] `/sitemap.xml` + trang con hợp lệ, lọc bằng `publicStoryWhere` (không 18+, không tác giả bị ban), chương đi qua `canReadChapter`, tag chuẩn
- [ ] Canonical, sitemap và đích 301 dùng cùng `canonicalPath`
- [ ] `/robots.txt` trỏ sitemap ở production, chặn toàn bộ ở môi trường khác
- [ ] Gate xanh; checkbox `[x]`

## Risk Assessment

| Rủi ro | Khả năng × Tác động | Giảm thiểu |
|---|---|---|
| Server route sitemap kéo code server vào bundle client | Thấp × Cao | Kiểm sourcemap (step 8); nếu lọt thì import động trong handler |
| Root loader làm mọi lần chuyển trang gọi RPC | Thấp × Thấp | `staleTime: Infinity`; kiểm Network |
| `head()` lệch giữa SSR và client gây cảnh báo hydrate | Thấp × Thấp | Chỉ dùng loader data, không dùng `window`/env |
| OFFSET lớn làm trang sitemap cuối chậm khi có triệu chương | Thấp × Thấp (năm đầu) | Cache CDN 1 giờ; đổi sang keyset khi cần |
| Cache CDN giữ sitemap cũ sau khi ẩn truyện/ban | TB × Thấp | Chấp nhận trễ ≤ 1 giờ; trang truyện/chương đã bị purge qua outbox và 404 |
| Sitemap có query lạ tạo bản cache riêng | Thấp × Thấp | Bản sao chỉ sống tới TTL 1 giờ như bản chuẩn và chỉ chứa URL công khai; **không** bật bỏ query (cache key giữ query string theo `docs/deployment-cloudflare.md` của phase 7). Muốn CDN cache sitemap thì thêm `/sitemap*`, `/robots.txt` vào danh sách route của Cache Rule trong tài liệu đó <!-- Red Team: consistency sweep — không bỏ query khỏi cache key --> |

Rollback: gỡ server route và quay head về bản phase 7/10; không có migration.

## Security Considerations

- Không đưa truyện 18+, nội dung bị ẩn, nháp hay nội dung của tác giả bị ban vào sitemap/robots; truyện qua `publicStoryWhere`, chương luôn qua `canReadChapter`.
- Canonical/OG chỉ dựng từ `APP_URL` và dữ liệu DB, không từ header `Host` (chống host header poisoning cache).
- Description/title đi qua React (escape), không chèn HTML thô vào `<head>`.

## Next Steps

Phase 17: backup offsite và thử restore (gate trước khi mở public).

## Câu hỏi mở (đã chốt — Validation Session 1, 2026-10-05)

1. Ảnh OG mặc định: bản tối giản từ tokens (tên site trên nền ngà, vạch màu nhấn đất nung).
2. `siteName` giữ "Novel Hub" (`m.app_name()`).

