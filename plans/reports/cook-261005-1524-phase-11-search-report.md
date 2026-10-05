# Cook phase 11 — Tìm kiếm Meilisearch

Ngày: 2026-10-05 · Plan: `plans/261004-1654-giai-doan-1-doc-va-viet/phase-11-tim-kiem-meilisearch.md` · Spec checkbox 8 `[x]`.

## Đã làm

- **Shared:** `meiliWebEnvSchema`, `meiliWorkerEnvSchema`, `assertMeiliMasterKeyStrength`, `assertMeiliSearchKeyIsNotMaster` (`env.ts`); `searchQuerySchema` (mọi trường `.catch`, số do router parse được đổi lại thành chuỗi), `WORD_RANGES`, `searchSyncPayload` (`schemas/search.ts`); `CONTENT_JOBS.searchSync`; key i18n `search_*`, `layout_search*`.
- **Core `search/`:** `client.ts` (timeout 10s, chờ task + kiểm `succeeded`, tiền tố index từ `QUEUE_PREFIX`), `settings.ts` (typo `oneTypo: 4`), `documents.ts`, `sync.ts` (đọc lại tới khi ổn định), `query.ts` (`buildStoryFilter`, `searchCatalog` một `multiSearch`), `reindex.ts` (upsert lô + kiểm DB trước khi xoá). `jobsForChange` thêm `search-sync` (retry 11 lần như purge). `canonicalTagSlug`, `selectStoryCardsWith`.
- **API:** `GET /api/v1/search` (`no-store`, 503 `SEARCH_UNAVAILABLE`, 18+ theo preferences server đọc); `ApiDeps.search`.
- **Worker:** processor `search-sync` (settings lười, ctx `null` → bỏ qua + cảnh báo một lần), `content-router`; `pnpm search:reindex` (`apps/worker/src/scripts/reindex-search.ts`).
- **Web:** `infra.ts` dùng search-only key; route `/search` (`search.tsx`, `noindex`, `LIST_CACHE`, `stripSearchParams`), `SearchForm`, `SearchResults`, ô tìm kiếm ở header (form GET; màn hẹp là link).
- **Env/docs:** `.env.example` thêm `MEILI_SEARCH_KEY` (trống); `.env` local đã ghi Default Search API Key dev (không in giá trị); `CLAUDE.md` thêm `pnpm search:reindex` và ghi chú sau `db:seed`.

## Test

- Unit: env, schema, `buildStoryFilter`, `storyDocToCard`, `searchIndexNames`, `applySettled`, `jobsForChange`, processor, route API (fake client), helper URL web.
- Int (Meilisearch + Postgres thật, tiền tố ngẫu nhiên): có dấu/không dấu/hoa, `duong` ↔ "Đường", gõ sai từ đầu với `matchingStrategy: 'all'` + ca âm, 18+, lọc tag (gồm tag gộp)/trạng thái/số chữ, ẩn/khôi phục, ban/bỏ ban/đổi tên, tác giả mất truyện cuối, reindex xoá rác, outbox → processor hai thay đổi liên tiếp; API với preferences thật.
- E2E `search.spec.ts`: shell `noindex` + cache, 301 path hoa, query lạ → 307 về `/search`, tìm không dấu, 18+ ẩn với khách, lọc trạng thái qua form, khối tác giả, query số `1984`, ô tìm ở header.
- Gate: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e` xanh (unit 455, int 227 + 1 skip S3, e2e 53).

## Review

`code-reviewer-261005-1454-phase-11-search-review-report.md`: 8/10. Đã sửa M1 (query số bị mất), M2 (retry search-sync), M3 (race hai job sync), L1 (guard key), L4 (message tiếng Anh), L5 (ghi chú reindex sau seed). Chưa sửa: L2, L3, L6 (xem dưới).

## Câu hỏi mở

- L3: khách vẫn thấy tác giả chỉ có truyện 18+ (hiện "0 truyện") — đúng quy tắc plan ("≥ 1 truyện công khai"). Có muốn ẩn tác giả này với khách không?
- L2: index bị xoá khi worker đang chạy → worker tạo lại không có settings, search 503 tới khi `pnpm search:reindex`. Chấp nhận (sự cố hiếm, có lệnh cứu)?
- Deploy: web process nên có env riêng không chứa `MEILI_MASTER_KEY` (hiện dev đọc chung `.env`).
