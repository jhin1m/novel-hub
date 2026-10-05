---
phase: 11
title: "Phase 11: Tìm kiếm Meilisearch"
status: completed
priority: P1
effort: "2d"
dependencies: [10]
---

# Phase 11: Tìm kiếm Meilisearch

Spec checkbox: `Tìm kiếm Meilisearch: truyện và tác giả, lọc theo tag, trạng thái, số chữ.`

## Context Links

- Spec mục 2 (Meilisearch: có dấu/không dấu, gõ sai), mục 3 (việc nặng qua hàng đợi), mục 4 (URL `/search?q=...`), mục 7 (18+ không vào tìm kiếm khi chưa bật; tác giả bị ban: nội dung ẩn), mục 11 (Meilisearch không backup, dựng lại bằng reindex)
- [plan.md](./plan.md) — "Tìm kiếm", "Hàng đợi"
- `plans/reports/researcher-261004-2352-storage-search-infra-report.md` mục 0, 4
- `plans/reports/researcher-261004-2352-tanstack-start-ssr-ui-report.md` mục 8 (`validateSearch`, `loaderDeps`)
- `docker-compose.yml:54-60` (Meilisearch), `.env.example:35-45` (`QUEUE_PREFIX`, `MEILI_URL`, `MEILI_MASTER_KEY`), `packages/shared/src/env.ts:32-34` (`queueEnvSchema`), `apps/web/playwright.config.ts:39` (`QUEUE_PREFIX: 'e2e'`), `apps/worker/src/env.test.ts:16-17` (`toEqual` chính xác)
- Phase 2 (`getInfra()`, hệ phụ tuỳ chọn degrade `null` → 503 qua `loadOptionalEnv` của `@novel-hub/shared/env`, `validate()`, `coreError()`, `makeTestApiDeps`); phase 5 (outbox `content_events`, `recordContentChanges`, `jobsForChange`, `ContentChange`, `apps/worker/src/content-router.ts#routeContentJob`, `ContentJobDeps`); phase 7 (`getPreferences`); phase 9 (event `user` từ hook Better Auth); phase 10 (`StoryCardDto`, `storyCardColumns`, `publicStoryWhere`, `StoryGrid`, `StoryCard`) <!-- Red Team: tên hợp đồng phase 2/5/9 và số phase mới -->

## Overview

- **Core `search`:** client Meilisearch; hai index `stories`, `authors` có tiền tố lấy từ `QUEUE_PREFIX`; settings; map document; `syncStory`/`syncAuthor`/`syncUserContent` idempotent; `reindexAll` đơn giản (upsert toàn bộ + xoá doc không còn công khai); `searchCatalog`.
- **Đồng bộ qua outbox:** `jobsForChange` (phase 5) map event story/chapter/user → job `search-sync` trên queue `content`; processor trong `content-router.ts`. <!-- Red Team: outbox thay afterContentChanged -->
- **Hai key:** web dùng search-only key `MEILI_SEARCH_KEY`; worker và lệnh reindex giữ `MEILI_MASTER_KEY`. <!-- Red Team: X7 -->
- `GET /api/v1/search`; trang `/search` (shell SSR, kết quả tải ở client); link tìm kiếm ở header.
- Lệnh `pnpm search:reindex` dựng lại index từ Postgres.

## Key Insights

- **Nguồn chuẩn là Postgres.** Job chỉ mang khoá nội bộ (UUID, không ra ngoài); processor đọc row hiện tại: còn công khai → upsert; không còn → delete. Idempotent, không phụ thuộc thứ tự. Quy tắc `jobId` theo phase 5 (không `jobId` cố định). <!-- Red Team: một quy tắc jobId ở phase 5, bỏ nhắc lại -->
- **Khoá document:** stories dùng `publicId`, authors dùng `username`; không đưa UUID vào index vì hit trả thẳng cho client.
- **Ban và đổi tên:** truyện công khai lọc bằng `publicStoryWhere` (tác giả không banned, phase 10). Event `user` (`updated` | `banned` | `unbanned`) → `syncUserContent`: sync author + mọi truyện của tác giả (ban → các doc bị xoá; bỏ ban → có lại; đổi tên → `authorName` mới). <!-- Red Team: event user → sync -->
- **18+:** server tự thêm `isMature = false` trừ khi preferences của user (server đọc) bật `showMature`.
- **Filter là chuỗi:** mọi giá trị vào filter qua Zod (slug `^[a-z0-9-]{1,80}$`, enum, số nguyên), dạng mảng filter, không ghép chuỗi tự do. Schema dùng `.catch`, nên giá trị lạ bị bỏ (200), không ra 400.
- **Gõ sai với tiếng Việt:** từ tiếng Việt thường 2–4 chữ cái; mặc định Meilisearch (`oneTypo: 5`) gần như không sửa lỗi cho từ ngắn. Đặt `typoTolerance.minWordSizeForTypos = { oneTypo: 4, twoTypos: 8 }`. Từ ≤ 3 chữ (`dao`, `ton`) vẫn không sửa: chấp nhận. <!-- Red Team: typo tolerance -->
- **Test gõ sai phải dùng `matchingStrategy: 'all'` và đặt lỗi ở từ đầu:** mặc định `last` bỏ dần từ cuối, nên `kiem daoo` có thể "pass" nhờ bỏ `daoo` chứ không nhờ sửa lỗi. API vẫn dùng mặc định `last` (recall tốt hơn). <!-- Red Team: test gõ sai từ đầu -->
- **`đ`:** Charabia bỏ dấu chữ Latin, `đ` chưa có docs xác nhận. Int test quyết định; nếu `duong` không ra `đường` thì thêm `titleFolded`/`authorNameFolded` (hàm bỏ dấu của `slugify`, giữ khoảng trắng) vào `searchableAttributes`.
- **Task async:** `updateSettings` và mọi lệnh ghi phải chờ task rồi kiểm `status === 'succeeded'` (task lỗi không throw). Worker không chết khi Meilisearch chết lúc boot: đảm bảo settings kiểu lười, nhớ promise, lỗi thì xoá để lần sau thử lại.
- **Timeout:** mọi request tới Meilisearch có timeout 10 giây (option `timeout` của client; chờ task có `timeout` riêng). Kiểm đúng tên option trong type `meilisearch@0.62.0` đã cài. Không dùng chung một `AbortSignal` cho nhiều request. <!-- Red Team: fetch timeout -->
- **Tiền tố index:** `${QUEUE_PREFIX}_stories`, `${QUEUE_PREFIX}_authors`. Dev `novelhub`, e2e `e2e` (đã có ở playwright config), int test `test_<rand>` truyền thẳng. `searchIndexNames` kiểm `^[a-zA-Z0-9_-]{1,32}$` (ký tự hợp lệ của index uid), sai thì throw lúc boot. Không thêm env tiền tố riêng. <!-- Red Team: bỏ MEILI_INDEX_PREFIX -->
- **Reindex đơn giản:** upsert toàn bộ truyện/tác giả công khai theo lô; sau đó duyệt id doc trong index, id nào không có trong tập vừa upsert thì **kiểm lại DB** (`loadStoryDoc`) rồi mới xoá (tránh xoá truyện vừa công khai trong lúc reindex). Không index tạm, không swap, không catch-up theo `updated_at`. <!-- Red Team: reindex đơn giản -->

## Requirements

**Functional**

- **Document `stories`:** `publicId`, `slug`, `title`, `synopsis`, `authorUsername`, `authorName`, `coverUrl`, `mainTagSlug`, `mainTagName`, `tagSlugs` (canonical, bỏ trùng), `status`, `wordCount`, `chapterCount`, `lastChapterAt` (epoch giây, null → 0), `createdAt` (epoch giây), `isMature`, `isAiAssisted`. Chỉ truyện `publicStoryWhere({ includeMature: true })`.
- **Settings `stories`:** searchable `[title, authorName, synopsis]`; filterable `[tagSlugs, mainTagSlug, status, wordCount, isMature, isAiAssisted, authorUsername]`; sortable `[lastChapterAt, wordCount, createdAt]`; `typoTolerance.minWordSizeForTypos { oneTypo: 4, twoTypos: 8 }`.
- **Document `authors`:** `username`, `displayName`, `avatarUrl`, `storyCount` (truyện công khai không 18+); chỉ tác giả không bị ban và có ≥ 1 truyện công khai. Settings: searchable `[displayName, username]`, sortable `[storyCount]`, cùng `typoTolerance`.
- **`jobsForChange` (phase 5) thêm:**
  - `story` (mọi action) và `chapter` (mọi action: bộ đếm đổi) → `search-sync { kind: 'story', storyId }`; processor sync truyện **và** tác giả của truyện;
  - `user` (`updated` | `banned` | `unbanned`) → `search-sync { kind: 'user', userId }`.
- **`GET /api/v1/search`:**
  - query: `q` (≤ 100 ký tự, trim), `tag`, `status`, `minWords`, `maxWords`, `page` (1–50);
  - trả `{ stories: { hits: StoryCardDto[], page, totalPages, totalHits }, authors: AuthorHit[] }`; `authors` chỉ khi `q` không rỗng và `page = 1`, tối đa 5;
  - `q` rỗng → duyệt theo bộ lọc, sắp `lastChapterAt:desc`;
  - search ctx `null` (thiếu env) hoặc Meilisearch lỗi/timeout → 503 `SEARCH_UNAVAILABLE`; `no-store`.
- **`/search`:** `validateSearch` bằng schema shared (mọi trường `.catch`), `loaderDeps`; loader chỉ lấy tag thể loại cho bộ lọc; form: ô tìm, tag, trạng thái, khoảng số chữ (`< 50k`, `50k–200k`, `200k–500k`, `> 500k`); submit → `navigate({ search })`; kết quả `useQuery`; phân trang; rỗng/lỗi/đang tải. Header `LIST_CACHE`, meta `noindex`. Shell không phụ thuộc query nên route này **không** áp allowlist canonical của phase 7 (query là nội dung); vẫn 301 khi path chữ hoa.
- Link từ kết quả tới trang truyện/tác giả là `<Link reloadDocument>` (quy tắc phase 7/10).
- Header site: ô/link tìm kiếm dẫn tới `/search?q=`.
- `pnpm search:reindex`: dựng lại hai index từ DB, in số document upsert/xoá, exit code ≠ 0 khi lỗi.

**Non-functional**

- Master key chỉ ở worker và lệnh reindex; web chỉ có search-only key; không key nào ra browser.
- Kết quả < 300 ms ở dữ liệu dev. Một request API = một `multiSearch`.

## Architecture

```
tx core (truyện/chương phase 5, mod phase 15, hook user phase 9) ─ recordContentChanges ─▶ content_events
worker drain-content-events ─ jobsForChange ─▶ queue content: search-sync {kind:'story', storyId} | {kind:'user', userId}
content-router.ts#routeContentJob ─▶ processSearchSync (master key)
  await ensureSearchReady()   (lười: tạo index nếu thiếu + updateSettings + chờ task)
  story → syncStory(storyId) + syncAuthor(authorId)     user → syncUserContent(userId)

browser /search?q=kiem+dao&tag=tien-hiep ── useQuery ──▶ GET /api/v1/search (hc)
  api: sessionMiddleware → validate('query') → includeMature = prefs.showMature (khách: false)
       → deps.search ?? 503 → core.searchCatalog(ctx(search key), query, { includeMature })
            multiSearch([{ indexUid: stories, q, filter: [...], page, hitsPerPage: 20 }, { indexUid: authors, q, limit: 5 }])

pnpm search:reindex → apps/worker/src/scripts/reindex-search.ts → core.reindexAll(db, ctx(master))
  upsert lô 1000 (keyset id) → liệt kê id doc → id thiếu trong tập → loadStoryDoc lại → null thì delete
```

```ts
// packages/shared/src/env.ts — đọc bằng loadOptionalEnv (phase 2): production thiếu → throw; dev thiếu/thiếu nửa → warn + null
export const meiliWebEnvSchema = z.object({ MEILI_URL: httpUrl, MEILI_SEARCH_KEY: z.string().min(1) });
export const meiliWorkerEnvSchema = z.object({ MEILI_URL: httpUrl, MEILI_MASTER_KEY: z.string().min(1) });
export function assertMeiliMasterKeyStrength(cfg: { MEILI_MASTER_KEY: string }, nodeEnv: string): void; // production && < 16 ký tự → throw; dev bỏ qua

// packages/shared/src/schemas/search.ts
export const searchQuerySchema = z.object({
  q: z.string().trim().max(100).catch(''),
  tag: z.string().regex(/^[a-z0-9-]{1,80}$/).optional().catch(undefined),
  status: z.enum(['ongoing', 'completed', 'hiatus']).optional().catch(undefined),
  minWords: z.coerce.number().int().min(0).optional().catch(undefined),
  maxWords: z.coerce.number().int().min(0).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(50).catch(1),
});
export const searchSyncPayload = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('story'), storyId: z.uuid() }),
  z.object({ kind: z.literal('user'), userId: z.uuid() }),
]);

// packages/core/src/search/*
export interface SearchCtx { client: Meilisearch; names: { stories: string; authors: string } }
export function createSearchCtx(cfg: { url: string; apiKey: string; prefix: string }): SearchCtx; // timeout 10s
export function searchIndexNames(prefix: string): SearchCtx['names'];
export function ensureSearchSettings(ctx: SearchCtx): Promise<void>;
export function buildStoryFilter(q: SearchQuery, o: { includeMature: boolean }): string[];
export function syncStory(db, ctx, storyId: string): Promise<'upserted' | 'deleted' | 'missing'>;
export function syncAuthor(db, ctx, userId: string): Promise<'upserted' | 'deleted' | 'missing'>;
export function syncUserContent(db, ctx, userId: string): Promise<void>;
export function searchCatalog(ctx, q: SearchQuery, o: { includeMature: boolean }): Promise<SearchResult>;
export function reindexAll(db, ctx, log?: (m: string) => void): Promise<{ upserted: number; deleted: number }>;
```

## File Inventory

| File | Action | Ghi chú |
|---|---|---|
| `packages/core/package.json` | modify | `meilisearch@0.62.0` (thuộc mục 2, đã duyệt) |
| `packages/shared/src/env.ts` (+ test) | modify | `meiliWebEnvSchema`, `meiliWorkerEnvSchema`, `assertMeiliMasterKeyStrength`; test qua `loadOptionalEnv` <!-- Red Team: consistency sweep — loadOptionalEnv thay requireMeiliInProduction --> |
| `.env.example` | modify | `MEILI_SEARCH_KEY` kèm mô tả cách lấy (đã duyệt; dùng Default Search API Key) |
| `packages/shared/src/schemas/search.ts` (+ test) | create | `searchQuerySchema`, `WORD_RANGES`, `searchSyncPayload` |
| `packages/shared/src/queues.ts` (+ test) | modify | `CONTENT_JOBS.searchSync` |
| `packages/core/src/search/{client,settings,documents,sync,query,reindex}.ts` | create | |
| `packages/core/src/search/*.test.ts` | create | `buildStoryFilter`, map doc → `StoryCardDto`, `searchIndexNames` |
| `packages/core/src/search/search.int.test.ts` | create | Meilisearch + Postgres thật, tiền tố ngẫu nhiên, dọn index sau test |
| `packages/core/src/content/hooks.ts` (phase 5) (+ test) | modify | `jobsForChange` thêm `search-sync` |
| `packages/core/src/index.ts` | modify | export |
| `packages/api/src/routes/search.ts` (+ test) | create | chain `GET /` |
| `packages/api/src/app.ts`, `deps.ts` | modify | mount `/search`; `ApiDeps.search: SearchCtx \| null` |
| `makeTestApiDeps` (packages/api, phase 2) | modify | mặc định `search: null` |
| `apps/web/src/server/infra.ts` (phase 2) | modify | `loadOptionalEnv(meiliWebEnvSchema, process.env, 'meili')`; `null` → `search: null` |
| `apps/web/src/server-fns/catalog.ts` (phase 10) | modify | `getSearchFilters()` |
| `apps/web/src/routes/search.tsx` | create | |
| `apps/web/src/components/search/search-form.tsx`, `search-results.tsx` | create | |
| `apps/web/src/components/site-layout.tsx` | modify | ô/link tìm kiếm |
| `apps/worker/src/processors/search-sync.ts` (+ test) | create | |
| `apps/worker/src/content-router.ts` (phase 5) | modify | case `search-sync`; `ContentJobDeps.search` |
| `apps/worker/src/index.ts` | modify | `loadOptionalEnv(meiliWorkerEnvSchema, process.env, 'meili')` + `assertMeiliMasterKeyStrength`; `null` → `ContentJobDeps.search = null` |
| `apps/worker/src/env.ts`, `env.test.ts` | không sửa | Meili không ghép vào `workerEnvSchema` nên `toEqual` ở `env.test.ts:16-17` giữ nguyên |
| `apps/worker/src/scripts/reindex-search.ts`, `apps/worker/package.json` | create/modify | script `search:reindex` |
| `package.json` (gốc) | modify | `"search:reindex": "pnpm --filter @novel-hub/worker search:reindex"` |
| `apps/web/e2e/global-setup.ts` | modify | xoá index `e2e_*` (master key từ `.env`) |
| `apps/web/e2e/search.spec.ts`, `e2e/helpers/content.ts` | create/modify | helper gọi `ensureSearchSettings` + `syncStory` trực tiếp |
| `CLAUDE.md` (bảng lệnh) | modify | `pnpm search:reindex` (chờ user đồng ý) |
| `packages/shared/messages/vi.json` | modify | key `search_*` |

## Implementation Steps

1. **Duyệt dep và env:** cài `meilisearch@0.62.0` vào `packages/core`; thêm hai schema Meili + `assertMeiliMasterKeyStrength` (đọc bằng `loadOptionalEnv` ở web `infra.ts` và worker `index.ts`); user thêm `MEILI_SEARCH_KEY` vào `.env` (lấy "Default Search API Key" bằng `curl -H "Authorization: Bearer $MEILI_MASTER_KEY" $MEILI_URL/keys`).
2. **Shared:** `searchQuerySchema`, `WORD_RANGES`, `searchSyncPayload`, `CONTENT_JOBS.searchSync`. Unit test `.catch` từng trường; tag có dấu ngoặc kép → `undefined`.
3. **Core `client.ts`:** `createSearchCtx` (timeout 10s), `searchIndexNames` (regex). Unit test tiền tố hợp lệ/không hợp lệ.
4. **Core `settings.ts`:** `STORY_INDEX_SETTINGS`, `AUTHOR_INDEX_SETTINGS`; `ensureSearchSettings` tạo index nếu thiếu (`primaryKey`), `updateSettings`, chờ task, `failed` → throw kèm `error.code`. Kiểm API chờ task của 0.62.0 trước khi viết.
5. **Core `documents.ts`:** `loadStoryDoc(db, storyId)` (như `storyCardColumns` + `tagSlugs` canonical + `synopsis`, điều kiện `publicStoryWhere`; trả `{ publicId, doc | null }`); `loadAuthorDoc(db, userId)`.
6. **Core `sync.ts`:** `syncStory`, `syncAuthor` (row không tồn tại → `'missing'`, không throw); `syncUserContent` = `syncAuthor` + `syncStory` cho mọi truyện của user (mọi visibility). Mỗi lệnh ghi chờ task và kiểm status.
7. **Core `query.ts`:** `buildStoryFilter` (luôn `isMature = false` khi `!includeMature`; `tagSlugs = "<slug>"`; `status = <enum>`; `wordCount >= n`, `<= n`); `tag` quy về canonical qua core tags trước khi lọc; `searchCatalog` dùng `multiSearch`, map hit → `StoryCardDto`.
8. **Core `reindex.ts`:** như Architecture; liệt kê id doc bằng `getDocuments({ fields: [pk], limit, offset })`.
9. **`jobsForChange`:** thêm case theo Requirements. Unit test: mỗi biến thể `ContentChange` ra đúng job, không có `jobId`.
10. **Worker:** processor `search-sync` parse payload, `ensureSearchReady` lười; lỗi mạng/timeout → throw để BullMQ retry; thêm case trong `content-router.ts`; `index.ts` dựng ctx bằng master key và `env.QUEUE_PREFIX`; ctx `null` (dev thiếu env) → processor log rồi bỏ qua (reindex là đường cứu).
11. **Script reindex:** `tsx src/scripts/reindex-search.ts` (env worker + DB); in tiến độ; đóng pool/Redis rồi thoát.
12. **API `routes/search.ts`:** `.get('/', sessionMiddleware, validate('query', searchQuerySchema), handler)`; `includeMature` qua `getPreferences` (phase 7); `deps.search` null hoặc lỗi Meilisearch → 503 `SEARCH_UNAVAILABLE` qua `coreError()` (log chi tiết ở server). Test dựng app bằng `makeTestApiDeps`.
13. **Web:** `infra.ts` dựng search ctx bằng `MEILI_SEARCH_KEY`; route `apps/web/src/routes/search.tsx` (`validateSearch`, `loaderDeps`, loader tag lọc, `headers: LIST_CACHE`, `noindex`); `SearchForm`, `SearchResults` (`useQuery(['search', search])`, `StoryGrid`, khối "Tác giả", phân trang); header thêm ô tìm kiếm.
14. **Int test tiếng Việt** (ma trận; thiếu `MEILI_URL`/`MEILI_MASTER_KEY` → fail với thông báo rõ, Meilisearch luôn có sau `pnpm infra:up`): test lỗi với `đ` → bật phương án `*Folded`, chạy lại.
15. **E2E `search.spec.ts`:** helper tạo truyện + gọi `syncStory` trực tiếp bằng master key, tiền tố `e2e` (e2e không chạy worker); tìm "kiem dao" thấy truyện; lọc trạng thái; truyện 18+ không hiện với khách.
16. **Gate:** `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e`. Đánh `[x]` checkbox "Tìm kiếm Meilisearch: truyện và tác giả, lọc theo tag, trạng thái, số chữ." trong spec.

## Function / Interface Checklist

- [x] `meiliWebEnvSchema`, `meiliWorkerEnvSchema`, `assertMeiliMasterKeyStrength`
- [x] `searchQuerySchema`, `WORD_RANGES`, `searchSyncPayload`
- [x] `createSearchCtx`, `searchIndexNames`, `ensureSearchSettings`
- [x] `loadStoryDoc`, `loadAuthorDoc`, `syncStory`, `syncAuthor`, `syncUserContent`
- [x] `buildStoryFilter`, `searchCatalog`, `reindexAll`
- [x] `jobsForChange` case `search-sync`; processor `search-sync`; script `reindex-search.ts`
- [x] `createSearchRoutes(deps)`; route `/search`, `SearchForm`, `SearchResults`

## Test Scenario Matrix

| Mức | Kịch bản | Loại |
|---|---|---|
| Critical | "Kiếm Đạo Độc Tôn" tìm được bằng `kiếm đạo`, `kiem dao doc ton`, `KIEM DAO` | int (Meilisearch thật) |
| Critical | `duong` ra truyện có "Đường"; `đường` cũng ra | int |
| Critical | Gõ sai ở từ đầu với `matchingStrategy: 'all'`: `kiemm dao doc ton`, `kiwm dao` vẫn ra; `xyzq dao` không ra | int |
| Critical | Khách / user chưa bật: không có truyện 18+; user đã bật: có | unit (`buildStoryFilter`) + unit (api) + int |
| Critical | `syncStory` truyện chuyển `hidden_by_mod`/draft → doc bị xoá; công khai lại → có lại | int |
| Critical | Event `user` `banned` → mọi doc truyện + doc tác giả bị xoá; `unbanned` → có lại; `updated` → `authorName` mới | int |
| High | Lọc tag (gồm tag đã gộp → canonical), trạng thái, khoảng số chữ | int |
| High | `tag='x" OR isMature = true'` → 200, filter tag không được áp (core nhận `tag: undefined`), không có 18+ | unit (api) |
| High | `deps.search = null` hoặc Meilisearch timeout → 503 `SEARCH_UNAVAILABLE`; worker vẫn chạy job mail | unit (api) + thủ công |
| High | `reindexAll`: index có doc rác → sau reindex chỉ còn truyện công khai; truyện công khai giữa chừng không bị xoá | int |
| High | Hai thay đổi liên tiếp đều được đồng bộ (không mất vì trùng `jobId`) | int (producer + processor) |
| High | `jobsForChange`: story/chapter → `{kind:'story'}`; user → `{kind:'user'}`; không `jobId` | unit |
| High | `loadOptionalEnv`: production thiếu `MEILI_SEARCH_KEY` (web) / `MEILI_MASTER_KEY` (worker) → throw; dev thiếu → `null`; `assertMeiliMasterKeyStrength`: 8 ký tự ở dev hợp lệ, ở production lỗi | unit |
| Medium | Tác giả mất truyện công khai cuối → doc author bị xoá | int |
| Medium | `searchIndexNames('a:b')` → throw | unit |
| Medium | `/search?page=abc&status=xyz` → trang không lỗi, dùng mặc định | e2e |
| High | E2E: tìm thấy truyện, link tới `/stories/...`; khối tác giả hiện khi khớp tên | e2e |

## Dependency Map

- **Cần:**
  - phase 2: `getInfra()`, `validate()`, `coreError()`, `makeTestApiDeps`, core tags;
  - phase 5: outbox, `jobsForChange`, `content-router.ts`, queue `content`, worker có DB;
  - phase 7: `getPreferences` (`showMature`);
  - phase 9: event `user` (`updated`) ghi từ hook Better Auth;
  - phase 10: `StoryCardDto`, `storyCardColumns`, `publicStoryWhere`, `StoryGrid`, header.
- **Phase sau dùng:**
  - phase 15: ẩn/khôi phục, ban/bỏ ban ghi event vào outbox → `search-sync` tự chạy; gộp tag → chạy `reindexAll` hoặc ghi event story cho truyện bị ảnh hưởng;
  - phase 16: `/search` `noindex` (đã đặt);
  - phase 17: runbook restore ghi `pnpm search:reindex`.

## Success Criteria

- [x] Tìm truyện và tác giả: có dấu/không dấu/gõ sai (từ đầu, `matchingStrategy: 'all'`) đều ra (int test xanh)
- [x] Lọc tag, trạng thái, số chữ; khách không thấy truyện 18+
- [x] Đổi trạng thái truyện, ban/bỏ ban, đổi tên tác giả → index cập nhật qua worker; `pnpm search:reindex` dựng lại được
- [x] Web chỉ giữ search-only key
- [x] Gate 5 lệnh xanh; checkbox spec = `[x]`

## Risk Assessment

| Rủi ro | Khả năng × Ảnh hưởng | Giảm thiểu |
|---|---|---|
| Meilisearch không quy `đ` → `d` | Trung bình × Cao | Int test quyết định; phương án `*Folded` |
| Gõ sai không sửa với từ ngắn | Cao × Trung bình | `oneTypo: 4`; từ ≤ 3 chữ chấp nhận không sửa |
| Test gõ sai "pass giả" do bỏ từ | Trung bình × Trung bình | `matchingStrategy: 'all'`, lỗi ở từ đầu, có ca âm |
| Task Meilisearch lỗi âm thầm | Trung bình × Trung bình | Luôn chờ task + kiểm status |
| Request treo làm kẹt worker | Thấp × Trung bình | Timeout 10s; sweeper ở queue riêng (phase 5) |
| Reindex xoá truyện vừa công khai | Thấp × Thấp | Kiểm lại DB trước khi xoá |
| Index lệch DB sau sự cố | Trung bình × Thấp | Outbox bền (phase 5); `pnpm search:reindex` |
| `QUEUE_PREFIX` có ký tự không hợp lệ cho index uid | Thấp × Thấp | `searchIndexNames` throw lúc boot |
| API `meilisearch` 0.x đổi tên hàm | Trung bình × Thấp | Ghim 0.62.0; đọc type đã cài |

Rollback: gỡ mount `/search`, route `/search`, case `jobsForChange`/`content-router`; xoá index trên Meilisearch. Không migration. Event cũ trong outbox chỉ còn tạo job khác (purge), không lỗi.

## Security Considerations

- Web chỉ có search-only key; master key ở worker/lệnh reindex. Lộ key web cũng chỉ đọc được dữ liệu vốn công khai. <!-- Red Team: X7 -->
- Filter dựng từ giá trị đã qua Zod; giá trị lạ bị bỏ, không nối chuỗi người dùng vào filter.
- Index không chứa UUID, email hay dữ liệu riêng tư.
- `isMature = false` do server ép, không tin client.
- Endpoint giới hạn `q` ≤ 100, `page` ≤ 50, 20 hit/trang. Rate limit theo IP cho search không nằm trong danh sách action của phase 13 (câu hỏi mở 2 đã chốt: chưa cần ở năm đầu).

## Câu hỏi mở (đã chốt — Validation Session 1, 2026-10-05)

1. `MEILI_SEARCH_KEY` = "Default Search API Key" Meilisearch tự tạo; user copy vào `.env` mỗi môi trường.
2. Chưa rate limit `GET /api/v1/search` ở năm đầu.

## Kết quả cook (2026-10-05)

Gate 5 lệnh xanh (unit 455, int 227 + 1 skip S3, e2e 53). Review `../reports/code-reviewer-261005-1454-phase-11-search-review-report.md` (8/10; đã sửa M1–M3, L1, L4, L5). Report: `../reports/cook-261005-1524-phase-11-search-report.md`.

Lệch plan:
- Không cần `titleFolded`/`authorNameFolded`: int test xác nhận `duong` ra "Đường".
- `searchCatalog(db, ctx, query, o)` nhận thêm `db` để quy tag về canonical (`canonicalTagSlug` ở `catalog/tag-page.ts`); thêm `syncStoryAndAuthor`; mọi sync đọc lại row sau khi ghi và áp lại tới khi ổn định (job chạy song song).
- Tác giả: doc dựng bằng left join + group by (Drizzle bỏ tiền tố bảng trong subquery một bảng).
- `/search` có query lạ: router trả 307 về URL đã làm sạch (không phải 200); mặc định (`q=''`, `page=1`) bị lược khỏi URL bằng `stripSearchParams`.
- Job `search-sync` dùng chung retry 11 lần với purge.
- Thêm guard production: `MEILI_SEARCH_KEY` không được trùng `MEILI_MASTER_KEY`.

## Next Steps

Phase 12: tủ truyện và lịch sử đọc (nút "Đọc tiếp" ở trang truyện, `/library`).
