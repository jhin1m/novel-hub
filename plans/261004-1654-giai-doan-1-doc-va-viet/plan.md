---
title: "Giai đoạn 1: Đọc và viết"
description: "Dựng design tokens rồi làm 13 checkbox (17 phase) Giai đoạn 1 của spec: truyện, bìa, editor, đăng chương, revision, trang đọc, trang khám phá, tìm kiếm, tủ truyện, rate limit, kiểm duyệt, SEO, backup."
status: pending
priority: P1
effort: 30d
branch: main
tags: [frontend, backend, editor, search, moderation, seo, ops]
blockedBy: []
blocks: []
created: 2026-10-04
---

# Giai đoạn 1: Đọc và viết

## Overview

Giai đoạn 0 xong (`plans/261004-1255-giai-doan-0-nen-mong`). Spec `docs/project-spec.md` là nguồn chuẩn. Phase 1 dựng design tokens và nền UI (user chốt 2026-10-04, không ứng với checkbox nào). Phase 2–17 phủ đúng thứ tự 13 checkbox Giai đoạn 1 ở mục 5; checkbox 6 (trang đọc) tách thành phase 7–9, checkbox 11 (trùng lặp, báo cáo, mod) tách thành phase 14–15 (user chốt sau red team). Mỗi lần `/ak:cook` đúng một phase; checkbox chỉ đánh `[x]` ở phase cuối của nó.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Tác giả tạo truyện, viết chương có autosave, đăng/hẹn giờ, khôi phục revision | P1 |
| 2 | Độc giả đọc chương SSR, cache CDN được, trang đọc tuỳ chỉnh không nháy | P1 |
| 3 | Khám phá: trang chủ, truyện, tác giả, tag, tìm kiếm Meilisearch, tủ truyện | P1 |
| 4 | Chống lạm dụng: rate limit, kiểm tra trùng lặp, báo cáo, hàng chờ mod | P1 |
| 5 | SEO đủ và backup có bản ngoài VPS đã thử restore trước khi mở public | P1 |

## Phases

| # | Phase | Checkbox spec | Status |
|---|-------|---------------|--------|
| 1 | [Design tokens và nền UI](./phase-01-start.md) | (không, user thêm) | Completed |
| 2 | [Tạo và sửa truyện](./phase-02-tao-va-sua-truyen.md) | 1 | Done, chờ thử S3 thật (checkbox chưa `[x]`) |
| 3 | [Bìa mặc định dạng chữ](./phase-03-bia-mac-dinh-dang-chu.md) | 2 | Pending |
| 4 | [Editor Tiptap và autosave](./phase-04-editor-tiptap-autosave.md) | 3 | Pending |
| 5 | [Đăng chương và hẹn giờ](./phase-05-dang-chuong-va-hen-gio.md) | 4 | Pending |
| 6 | [Khôi phục revision](./phase-06-khoi-phuc-revision.md) | 5 | Pending |
| 7 | [Trang đọc: route, cache, giao diện](./phase-07-trang-doc-route-giao-dien.md) | 6 (phần 1/3) | Pending |
| 8 | [Trang đọc: cài đặt hiển thị](./phase-08-cai-dat-trang-doc.md) | 6 (phần 2/3) | Pending |
| 9 | [Trang đọc: tiến độ, purge CDN, lượt đọc](./phase-09-tien-do-purge-luot-doc.md) | 6 (đánh `[x]`) | Pending |
| 10 | [Trang truyện, tác giả, tag, trang chủ](./phase-10-trang-truyen-tac-gia-tag-trang-chu.md) | 7 | Pending |
| 11 | [Tìm kiếm Meilisearch](./phase-11-tim-kiem-meilisearch.md) | 8 | Pending |
| 12 | [Tủ truyện và lịch sử đọc](./phase-12-tu-truyen-lich-su-doc.md) | 9 | Pending |
| 13 | [Rate limit Redis](./phase-13-rate-limit-redis.md) | 10 | Pending |
| 14 | [Kiểm tra trùng lặp](./phase-14-kiem-tra-trung-lap.md) | 11 (phần 1/2) | Pending |
| 15 | [Báo cáo vi phạm và hàng chờ mod](./phase-15-bao-cao-hang-cho-mod.md) | 11 (đánh `[x]`) | Pending |
| 16 | [SEO: metadata, OG, sitemap, canonical](./phase-16-seo-metadata-sitemap.md) | 12 | Pending |
| 17 | [Backup offsite và thử restore](./phase-17-backup-offsite-restore.md) | 13 | Pending |

Phụ thuộc tuyến tính 1 → 17.

## Quyết định đã chốt

- **User (2026-10-04):** HOLD SCOPE (đúng 13 checkbox, không thêm không cắt); thêm phase 1 dựng tokens, màu nhấn do user chọn ở bước validate.
- **User (2026-10-05, sau red team):** áp dụng cả 15 finding; tách checkbox 6 thành phase 7–9 và checkbox 11 thành phase 14–15; giữ đếm lượt đọc ở phase 9 (mục 6).
- **User (2026-10-05):** URL công khai và tên file route tiếng Anh (bảng đổi trong docs/code-standards.md); slug nội dung vẫn tiếng Việt không dấu; query phân trang `page`.
- **Kiến trúc dữ liệu cho UI:**
  - Trang công khai: loader gọi `createServerFn({ method: 'GET' })` trong `apps/web/src/server-fns/` → `core`. Không TanStack Query cho dữ liệu công khai.
  - **Liên kết giữa các trang công khai là link tài liệu thường (`reloadDocument`)**, prefetch chương sau bằng `<link rel="prefetch">` HTML: mọi lượt xem đi qua HTML cache CDN, không gọi server fn từ browser (server fn GET không có cache header). <!-- Red Team: CDN bypass -->
  - Dữ liệu cá nhân và mọi thao tác ghi: Hono `/api/v1/*` + `hc` + TanStack Query ở browser (như `useMe`), `no-store`.
  - `apps/web/src/server/infra.ts` (tách từ `api-app.ts`) giữ pool/Redis/queue dùng chung cho Hono và server fn (phase 2). Hệ phụ tuỳ chọn (S3, Meilisearch, CDN) parse riêng, thiếu cấu hình thì degrade về `null` (endpoint của nó trả 503), không kéo sập trang đọc. <!-- Red Team: env singleton -->
  - Cache header SSR đặt bằng route option `headers` ở route lá; 404 cache ngắn; 301 bằng `redirect({ statusCode: 301 })`; không route công khai nào đụng session/cookie.
  - **URL chuẩn duy nhất:** route công khai 301 về URL chuẩn khi path không viết thường hoặc có query ngoài allowlist (tag chỉ cho `page`). Cloudflare Cache Rule chỉ cho HTML công khai, loại `/api/*`, `/_serverFn/*`; cache key **giữ** query string (nếu bỏ, phản hồi 301 của biến thể bị cache dưới key URL chuẩn → vòng redirect); biến thể chỉ cache phản hồi 301 nên purge không cần chạm (ghi ở docs, áp khi deploy). <!-- Red Team: cache variants -->
  - `parseStoryKey` (`{slug}-{publicId}`) và `canonicalPath(target)` (hàm dựng URL chuẩn duy nhất, dùng cho 301, canonical, purge, sitemap; phase 7 tạo, phase 9/10/12/16 dùng) ở `packages/shared`.
- **Hono:** mỗi domain một sub-app chain, validate bằng `@hono/zod-validator` qua helper `validate()`, lỗi core dịch bằng `coreError()`, schema Zod ở `packages/shared` dùng chung với form. Quyền qua `core/policies`, quyền đọc qua `core/access.canReadChapter()`. Test dựng app qua `makeTestApiDeps()`.
- **Giới hạn nội dung** (`LIMITS`) và tier rate limit khai báo ở `packages/shared`.
- **Editor:** Tiptap 3 (ghim chính xác cùng version), `editorExtensions` dùng chung ở `@novel-hub/shared/editor` (subpath riêng). Route editor `ssr: false`. Trang đọc không import `@tiptap/*`; chặn bằng nhóm mới trong block ESLint `no-restricted-imports` **hiện có** (không thêm block thứ hai). <!-- Red Team: ESLint override -->
- **Đăng chương:** server khoá story → chapter → draft (`FOR UPDATE`), kiểm base dưới khoá, kiểm schema ProseMirror → chuẩn hoá `pid` → **renderer tự viết** (đúng allowlist, không kéo React vào core/worker) → `sanitize-html` → đếm chữ → revision (giữ 20) → bộ đếm truyện → ghi outbox, trong một transaction. Client tạm dừng autosave và khoá editor khi đăng/khôi phục. `pid` 8 ký tự `[a-z2-9]`: client sinh bằng UniqueID, server là nguồn chuẩn. <!-- Red Team: publish race, renderer -->
- **Đếm chữ:** token cách nhau bởi khoảng trắng/gạch dài/dấu ba chấm, có chữ hoặc số; một hàm `countWords` ở `packages/shared`, đóng băng định nghĩa.
- **Autosave:** debounce 2s, `maxWait` 10s, một request tại một thời điểm; chống ghi đè giữa tab bằng `updated_at` do app đặt (ms) → 409 `DRAFT_CONFLICT`; mirror localStorage vì `sendBeacon` giới hạn ~64 KB.
- **Outbox và hàng đợi:** mọi thay đổi trạng thái nội dung ghi `content_events` trong cùng transaction (`recordContentChanges`); worker quét outbox định kỳ (job `drain-content-events` trên queue `publishing`), `jobsForChange` sinh job (queue `content`) purge CDN (phase 9), đồng bộ Meilisearch (phase 11), fingerprint (phase 14; job backfill chạy trên queue `publishing`). Không đặt `jobId` cố định; mọi processor idempotent. Sweeper hẹn giờ chạy ở queue `publishing` riêng (DB là nguồn chuẩn, `FOR UPDATE SKIP LOCKED`, bỏ qua tác giả bị ban). Mọi fetch ra ngoài có timeout 10s. <!-- Red Team: lost side effects -->
- **Purge CDN:** sự kiện truyện purge mọi chương từng đăng (bất kể trạng thái hiện tại); sự kiện user (đổi tên, ban) purge trang tác giả và mọi truyện/chương của họ. `CF_*` bắt buộc ở production; có lệnh `pnpm cdn:purge`.
- **Ảnh:** `sharp` (kiểm magic bytes và kích thước từ metadata trước khi decode, trần ~24 MP, ≥ 600×900, `rotate()`, WebP 600×900 và 300×450, tối đa 1–2 job đồng thời), key có hash nội dung → `immutable`; không xoá bìa cũ ở năm đầu. Checkbox 1 chỉ `[x]` sau khi thử upload MinIO thật.
- **Tìm kiếm:** job đồng bộ đọc row hiện tại rồi upsert/delete; chỉ index truyện `published` của tác giả không bị ban; `minWordSizeForTypos` hạ cho từ tiếng Việt ngắn; tiền tố index từ `QUEUE_PREFIX`; web dùng search-only key, worker giữ master key; server luôn thêm `is_mature = false` khi người dùng chưa bật 18+. Trang `/search` lấy kết quả ở client qua `/api/v1/search`.
- **Rate limit:** fixed window bằng một Lua script, một cơ chế duy nhất: Hono middleware (cả `/api/auth/*`, Better Auth limiter tắt); khoá chặt theo (email, IP) và IP, giới hạn theo email toàn cục chỉ đếm thất bại với ngưỡng cao (không để người khác khoá tài khoản); tier chặt hơn cho tài khoản mới. IP chỉ tin `CF-Connecting-IP` khi `TRUST_CF_IP=true`.
- **Trùng lặp:** MinHash 128 + LSH 16×8 + lọc Jaccard ≥ 0,7, SimHash 64-bit; cột `lsh_keys integer[]` + GIN; backfill cho chương thiếu fingerprint. Không tự ẩn, chỉ tạo `report`.
- **Ban:** một cơ chế — lọc `users.status <> 'banned'` ở mọi truy vấn công khai (`canReadChapter`, `publicStoryWhere`, sitemap, search); ban = đổi status + xoá session + outbox trong một transaction; không ẩn truyện hàng loạt. <!-- Red Team: ban mechanism -->
- **18+:** HTML SSR của mọi danh sách không chứa truyện 18+; người đã bật thì client tải thêm qua API. Trang truyện/chương 18+ có `noindex` và màn cảnh báo xử lý ở client.
- **Backup:** host cron `pg_dump -Fc` + `rclone` lên bucket R2 riêng có bucket lock + restore thử trong container tạm; script nằm trong repo, chạy trên VPS.

## Dependency mới (đã duyệt — validate 2026-10-05)

- Thuộc mục 2 spec (ghi lại để biết version): `@tiptap/core` (peer bắt buộc), `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-unique-id` (kéo `uuid`), `sanitize-html` + `@types/sanitize-html`, `sharp`, `meilisearch`, `@hono/zod-validator`, `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`.
- **Ngoài mục 2:** `aws4fetch` (S3 client cho MinIO, 0 dep), `@fontsource-variable/literata`, `@fontsource/be-vietnam-pro`, `@fontsource-variable/noto-serif`, `@fontsource-variable/inter`, `tw-animate-css` (chỉ khi component shadcn thực sự cần).

## Thay đổi config/env (đã duyệt — validate 2026-10-05)

- Env mới: `CF_ZONE_ID`, `CF_API_TOKEN` (purge; bắt buộc ở production, dev để trống = no-op), `TRUST_CF_IP` (chỉ production), `RATE_LIMIT_FACTOR` (e2e nới limit), `MEILI_SEARCH_KEY` (search-only key cho web). Rate limit và tiền tố index Meilisearch dùng lại `QUEUE_PREFIX`.
- `docker/backup/backup.env.example` (mẫu biến cho script backup, phase 17). Biến `S3_*`, `MEILI_*` đã có; user điền giá trị MinIO bucket dev.
- Migration mới: `0001` bảng `content_events` (outbox, phase 5); `0002` `chapter_fingerprints.lsh_keys integer[]` + GIN, cột `chapter_fingerprints.content_hash` (backfill) và partial unique index `reports_open_auto_key` (một báo cáo tự động đang mở cho mỗi cặp) (phase 14).
- `docs/moderation-guide.md` (hướng dẫn mod, phase 15).
- Worker ghép thêm `dbEnvSchema` (biến đã có); có thể thêm tuỳ chọn JSX vào `vitest.config.ts` (test component); ESLint bỏ qua `src/server-fns/**` và route sitemap/robots.
- `CLAUDE.md`: thêm lệnh `pnpm search:reindex`, `pnpm cdn:purge`, `pnpm db:seed-tags` (phase 2).
- `docs/`: tài liệu Cloudflare Cache Rule (áp khi deploy).

## Ngoài phạm vi

- Bình luận, theo dõi, thông báo, đánh giá, xếp hạng, dashboard số liệu: Giai đoạn 2. Bảng đã có, không xây.
- Upload avatar: hook auth đã bỏ `image`, nhưng không có checkbox nào ở Giai đoạn 1 → không làm (HOLD SCOPE); chỉ làm khi user yêu cầu.
- Deploy production (container web/worker, áp Cloudflare rule): chưa có checkbox; phase 17 chỉ cần VPS có Postgres chạy.

## Success Criteria

- [ ] 13 checkbox Giai đoạn 1 trong spec được đánh `[x]`
- [ ] Mỗi phase xanh gate `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e`
- [ ] Playwright có luồng chính: viết và đăng chương, đọc chương (theo mục 9 spec)
- [ ] Trang đọc/truyện/tác giả/tag trả `Cache-Control: public, s-maxage=…`, không có `Set-Cookie`, URL có query lạ hoặc chữ hoa bị 301 về URL chuẩn
- [ ] Ẩn/ban/đổi tên luôn sinh job purge và đồng bộ tìm kiếm kể cả khi Redis chập lúc commit (outbox)
- [ ] Backup offsite chạy và restore thử thành công trước khi mở public

## Research

- [Editor và pipeline nội dung](../reports/researcher-261004-2352-editor-content-pipeline-report.md)
- [Lưu trữ, tìm kiếm, hạ tầng](../reports/researcher-261004-2352-storage-search-infra-report.md)
- [TanStack Start SSR và UI](../reports/researcher-261004-2352-tanstack-start-ssr-ui-report.md)

## Câu hỏi mở

Đã chốt hết ở Validation Session 1 (xem `## Validation Log`). Còn chờ user, không chặn cook:
- Tạo bucket dev + key trên MinIO có sẵn trước bước 13 phase 2 (checkbox 1 chờ tới khi thử S3 thật).
- VPS + bucket R2 cho backup (phase 17 thử trên homelab, checkbox 13 chờ VPS).
- Duyệt bản nháp `/terms`, `/content-policy` trước khi mở public.

## Red Team Review

### Session — 2026-10-05
**Findings:** 15 sau khi gộp (34 thô từ 4 reviewer: Security Adversary, Failure Mode Analyst, Assumption Destroyer, Scope & Complexity Critic). User: áp dụng toàn bộ; tách phase 7 và 12 cũ.
**Severity:** 1 Critical, 11 High, 3 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | URL có query/chữ hoa tạo bản cache CDN riêng; purge chỉ URL chuẩn → nội dung bị ẩn vẫn phục vụ tới 8 ngày | Critical | Accept | Phase 7, 10, 16, plan |
| 2 | Job phụ (purge/search/fingerprint) enqueue sau commit, Redis chập là mất vĩnh viễn; không có lệnh purge tay; `CF_*` tuỳ chọn cả ở production | High | Accept (outbox) | Phase 5, 9, 11, 14, 15 |
| 3 | Chuyển trang phía client và prefetch gọi server fn, không qua CDN → origin gánh gần hết lượt đọc | High | Accept (link tài liệu thường) | Phase 7, 10, 12 |
| 4 | Đăng chương/khôi phục ghi đè chữ đang gõ (draft không khoá, ghi lại pid vô điều kiện) | High | Accept | Phase 4, 5, 6 |
| 5 | Purge khi ẩn truyện/ban liệt kê 0 chương → trang chương vẫn cache | High | Accept | Phase 9, 15 |
| 6 | Ban có hai cơ chế mâu thuẫn (lọc status và ẩn hàng loạt + note `ban:`); sweeper đăng chương của tác giả bị ban; đổi tên hiển thị không purge/sync | High | Accept | Phase 5, 7, 9, 10, 11, 15, 16 |
| 7 | Phase 6/7/9/12 dùng interface khác phase 4/5 (`CONFLICT`, `setBase`, `REVISION_KEEP`, đường dẫn hook/router); trích dẫn dòng sai | High | Accept | Phase 6, 7–9, 11, 13–15 |
| 8 | Thêm field vào `ApiDeps` làm vỡ 3 test dựng `createApp`; `env.test.ts` của worker; env singleton làm hệ phụ kéo sập trang đọc | High | Accept | Phase 2, 5, 9, 11 |
| 9 | Block ESLint thứ hai ghi đè options, mất chặn import `core`/`db` ở web | High | Accept | Phase 4, 7 |
| 10 | Phase 7 và 12 quá lớn cho một lần cook; đề xuất dời đếm lượt đọc trái HOLD SCOPE | High | User: tách + giữ đếm lượt đọc | Phase 7–9, 14–15 |
| 11 | Rate limit hai cơ chế; khoá theo email cho phép khoá tài khoản người khác; upload bìa/tạo chương không giới hạn, sharp không giới hạn đồng thời | High | Accept | Phase 2, 13 |
| 12 | Typo tolerance mặc định không áp cho từ tiếng Việt ≤ 4 ký tự; test gõ sai pass nhờ bỏ từ | High | Accept | Phase 11 |
| 13 | Đơn giản hoá: renderer tự viết thay static-renderer, `tw-animate-css` có điều kiện, bỏ `MEILI_INDEX_PREFIX`, reindex đơn giản, test tương phản bằng hằng, bỏ "Hoàn tác" | Medium | Accept | Phase 1, 5, 6, 11 |
| 14 | Checkbox bìa đánh `[x]` mà chưa thử S3 thật; xoá bìa cũ ngay làm vỡ ảnh trên HTML cache và sau restore | Medium | Accept | Phase 2, 17 |
| 15 | Linh tinh: bucket lock R2; search-only key Meilisearch; sweeper queue riêng + timeout fetch; thứ tự khoá story → chapter ở mod action | Medium | Accept | Phase 5, 11, 15, 17 |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01 … phase-17
- Decision deltas checked: 12 (đánh số mới 1–17; hợp đồng outbox/queue phase 5; canonical/cache phase 7; preferences phase 8; tiến độ/purge/lượt đọc phase 9; `makeTestApiDeps`/`loadOptionalEnv` phase 2; migration `0001`/`0002`; một cơ chế ban; rate limit một cơ chế; Meilisearch; cache key giữ query; bỏ "Hoàn tác")
- Stale references reconciled: ~90 ở 13 file (`afterContentChanged`, `static-renderer`, `customStorage`, `MEILI_INDEX_PREFIX`, `CONFLICT`, `REVISION_KEEP`, `setBase`, `after-content-changed.ts`, `router.ts` cho job nội dung, note `ban:`, "bỏ qua query string", số phase cũ); thêm `canonicalPath` dùng chung
- Unresolved contradictions: 0

## Validation Log

### Session 1 — 2026-10-05
**Trigger:** `/ak:plan validate` sau red team; trả lời 8 câu hỏi mở của plan + câu hỏi riêng từng phase.
**Questions asked:** 16 (4 lượt; câu cuối gom ~25 câu hỏi phase có đề xuất sẵn)

#### Questions & Answers

1. **[Architecture]** Màu nhấn duy nhất của Design System là gì?
   - Options: Đất nung #A8432A/#D9825F | Đỏ rượu #8C2F39/#E38A93 | Xanh mực #2F5D8A/#7FA8D6 | Xanh lam-rêu #1F6B66/#5FB3AA
   - **Answer:** Đất nung (light `#A8432A` 5.66:1, dark `#D9825F` 6.04:1)
   - **Rationale:** `--primary` ở tokens phase 1; kéo theo đổi `--cover-0` phase 3 (trùng tông).
2. **[Scope]** Duyệt dependency, env, migration liệt kê trong plan.md?
   - Options: Duyệt toàn bộ | Duyệt, bỏ tw-animate-css | Duyệt, thay aws4fetch bằng @aws-sdk/client-s3
   - **Answer:** Duyệt toàn bộ
   - **Rationale:** cook không phải dừng hỏi lại từng phase.
3. **[Architecture]** Truyện chuyển visibility draft → published khi nào?
   - Options: Tự động khi chương đầu đăng (A) | Tác giả bấm "Đăng truyện" (B)
   - **Answer:** A
   - **Rationale:** phase 5 không thêm endpoint `publish`.
4. **[Architecture]** Editor/allowlist có heading h2/h3 và hr?
   - Options: Giữ cả hai | Chỉ hr | Bỏ cả hai
   - **Answer:** Giữ cả heading và hr
5. **[Assumptions]** "Truyện mới đáng chú ý" tính thế nào khi chưa có lượt đọc?
   - Options: Tiêu chí tối thiểu (30 ngày, ≥ 3 chương, ≥ 10.000 chữ, 12 truyện, bù truyện mới) | Chỉ truyện mới nhất | Mod chọn tay
   - **Answer:** Tiêu chí tối thiểu
6. **[Scope]** Nội dung `/terms`, `/content-policy` lấy từ đâu?
   - Options: Claude viết nháp, user duyệt | User cung cấp
   - **Answer:** Claude viết nháp, user duyệt
7. **[Risks]** Hạ tầng ngoài đã sẵn sàng chưa? (multi)
   - Options: MinIO bucket dev + S3_* | Cloudflare zone + API token | VPS + bucket R2 | Chưa có gì
   - **Answer:** Cloudflare zone + API token
   - **Custom input:** "Có luôn môi trường staging (homelab, ssh nas là có sẵn ubuntu server), nhưng tôi chưa thiết lập gì."
   - **Rationale:** MinIO dev và VPS/R2 chưa có → hai câu hỏi tiếp theo.
8. **[Scope]** Thêm lệnh `pnpm db:seed-tags` idempotent ở phase 2?
   - Options: Có, dùng fixture hiện có | Có, user gửi danh sách | Không, thêm tay qua DB
   - **Answer:** Có, dùng fixture hiện có
9. **[Risks]** MinIO bucket dev chưa sẵn sàng — xử lý checkbox 1?
   - Options: Tạo bucket trên MinIO có sẵn | Dựng MinIO trên homelab | Chưa làm, để checkbox chờ
   - **Answer:** Tạo bucket trên MinIO có sẵn (trước bước 13 phase 2; chưa có thì SKIPPED, checkbox chờ)
10. **[Risks]** Phase 17 khi chưa có VPS/R2 nhưng có homelab?
    - Options: Thử trên homelab, checkbox chờ VPS | Chỉ thử local | Homelab là môi trường chính
    - **Answer:** Thử trên homelab, checkbox chờ VPS
11. **[Tradeoffs]** Khôi phục revision có tự chụp nháp hiện tại?
    - Options: Không, xác nhận + mirror localStorage | Có, chụp khi khác bản mới nhất
    - **Answer:** Không
12. **[Tradeoffs]** Rate limit khi Redis chết, giới hạn email toàn cục?
    - Options: Fail-closed mục cần mail + email chặn 50 sai/giờ | Fail-closed + email chỉ log | Fail-open tất cả + email chặn
    - **Answer:** Fail-closed mục cần mail + email chặn 50 lần sai/giờ
13. **[Scope]** Ảnh OG mặc định và tên site?
    - Options: Ảnh tối giản từ tokens, "Novel Hub" | User cung cấp ảnh | Đổi tên site
    - **Answer:** Ảnh tối giản từ tokens, tên "Novel Hub"
14. **[Risks]** Tuỳ chọn vận hành backup?
    - Options: Mã hoá + lock 30 ngày + healthchecks.io + 03:15 | Như trên, lock 14 ngày | Như trên, bỏ dead-man
    - **Answer:** Như trên nhưng lock 14 ngày
15. **[Tradeoffs]** Bỏ ban: chương hẹn giờ quá hạn xử lý thế nào?
    - Options: Đăng ngay ở lần quét kế | Chuyển về draft
    - **Answer:** Đăng ngay ở lần quét kế
16. **[Assumptions]** Chấp nhận toàn bộ đề xuất còn lại trong các phase?
    - Options: Chấp nhận toàn bộ | Chấp nhận, trừ một số mục
    - **Answer:** Chấp nhận toàn bộ

#### Confirmed Decisions
- Màu nhấn: đất nung `#A8432A` / `#D9825F`; bảng trung tính + 6 preset nguyên văn ("xanh dịu" = xanh lá nhạt); chưa có Design System/mockup.
- Bìa: bảng 10 màu, `--cover-0` đổi `#8C3B2E` → `#8A2F3C` (đỏ son, 7.77:1) để không trùng tông màu nhấn; bìa chữ không hiện tag.
- Dep/env/migration: duyệt toàn bộ.
- Truyện tự `published` khi chương đầu đăng; editor giữ h2/h3 + hr; không chặn "Thêm chương".
- Hẹn giờ 5 phút–365 ngày; xoá hết chương vẫn giữ `published`; khôi phục revision không chụp nháp.
- Trang đọc mặc định 19px / 1.8 / đoạn 1em / cột 60-68-75ch; dwell 30s, 3 lượt/người, 10/IP mỗi chương/ngày.
- Trang chủ "đáng chú ý" theo tiêu chí tối thiểu; điều khoản do Claude viết nháp; tác giả chưa có truyện → 404.
- Meilisearch dùng Default Search API Key; chưa rate limit search; tủ truyện không tự thêm, truyện bị ẩn thì ẩn im lặng.
- Rate limit: fail-closed cho `signUp`/`forgotPassword`/`sendVerification`, open cho phần còn lại; email toàn cục chặn > 50 thất bại/giờ; prefix `QUEUE_PREFIX`.
- Trùng lặp: Jaccard 0,7, thêm cột `content_hash`.
- Mod: báo cáo chỉ cần đăng nhập; mod + admin gộp tag; admin không ban admin; bỏ ban thì sweeper đăng chương quá hạn.
- SEO: OG tối giản từ tokens, `siteName` "Novel Hub".
- Backup: rclone crypt, lock `daily/` 14 ngày (lifecycle 19 ngày), healthchecks.io, 03:15 VN, restore thử ngày 1 hằng tháng; thử trên homelab, checkbox 13 chờ VPS.
- Hạ tầng: Cloudflare zone + token có sẵn; MinIO bucket dev user tạo trên server có sẵn; VPS + R2 chưa có.
- Upload avatar: không làm (HOLD SCOPE, không hỏi lại).
- Health và search công khai không rate limit ở năm đầu.

#### Action Items
- [ ] User: tạo bucket dev + key trên MinIO, điền `S3_*` trước bước 13 phase 2
- [ ] User: chuẩn bị homelab (Docker + Postgres) và bucket R2 trước phase 17; VPS trước khi mở public
- [ ] User: duyệt bản nháp điều khoản/quy định nội dung trước khi mở public

#### Impact on Phases
- Phase 1: `--primary` đất nung, bỏ placeholder TODO và rủi ro "chưa chọn màu nhấn".
- Phase 2: thêm `pnpm db:seed-tags` (file, bước 3, `CLAUDE.md`); S3 chưa có → `DONE_WITH_CONCERNS`, checkbox 1 chờ.
- Phase 3: `--cover-0` đỏ son.
- Phase 4, 5: heading + hr; phương án A; dep đã duyệt.
- Phase 10: tiêu chí "đáng chú ý" cụ thể; điều khoản bản nháp.
- Phase 13: `onStoreError` cụ thể; email phương án A; claim srvx được kiểm một phần.
- Phase 16: OG tối giản, "Novel Hub".
- Phase 17: lock 14/lifecycle 19 ngày, healthchecks.io, thử trên homelab.
- Phase 6–9, 11, 12, 14, 15: chốt câu hỏi mở theo đề xuất (không đổi kiến trúc).

### Verification Results
- **Tier:** Full (17 phase) — guard: red team đã có kiểm chứng bằng grep, bước này chỉ xử lý `[UNVERIFIED]` + spot-check
- **Claims checked:** 9
- **Verified:** 8 | **Failed:** 0 | **Unverified:** 1
- Verified: `apps/web/src/routes/api/$.ts` chuyển nguyên `request` cho `handleApiRequest`; `apps/web/src/server/api-app.ts`; `packages/api/src/{app,deps}.ts`; `QUEUE_PREFIX` (`packages/shared/src/env.ts:33`); block `no-restricted-imports` hiện có trong `eslint.config`; `srvx@1.0.5` có getter `ip` (`node.mjs:369`) và là bản `@tanstack/start-server-core` dùng; `db:seed` chạy qua `@novel-hub/auth`; guard seed localhost ở `packages/db/src/seed/guard.ts`.
- Unverified: phase 13 — `request` trong handler có phải object srvx ở dev/build không; chỉ kiểm được lúc chạy, giữ ở bước 3 phase 13.

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01 … phase-17
- Decision deltas checked: 9 (màu nhấn; `--cover-0`; `chờ duyệt` → đã duyệt; `db:seed-tags`; phương án A; tham chiếu "Câu hỏi mở N" trong thân phase; lock 30 → 14 ngày, lifecycle 35 → 19; homelab cho phase 17; OG/siteName)
- Reconciled stale references: 27 ở 13 file (đánh dấu `chờ duyệt`, tham chiếu "Câu hỏi mở N"/"đề xuất" đã chốt, giá trị lock/lifecycle, `--cover-0`, placeholder màu nhấn)
- Unresolved contradictions: 0

## Trạng thái và bước tiếp theo

- Đã xong: scope challenge, research (3), viết plan, red team (15 finding, áp toàn bộ), tách phase, consistency sweep.
- Đã validate (Session 1, 2026-10-05): mọi câu hỏi mở đã chốt.
- Phase 1 xong (2026-10-05): gate 5 lệnh xanh; review `../reports/code-reviewer-261005-1010-phase-01-design-tokens-review-report.md` (8/10, đã sửa M1–M3, L1, L2, L4, L5).
- Phase 2 xong code (2026-10-05): gate 5 lệnh xanh, `s3-storage.int.test.ts` SKIPPED vì `S3_*` trống; checkbox 1 chờ user tạo bucket MinIO dev rồi chạy bước 13. Review `../reports/code-reviewer-261005-1023-phase-02-stories-review-report.md` (8/10, đã sửa M1–M3, L3, L4, L7). Report: `../reports/cook-261005-1049-phase-02-stories-report.md`.
- Tiếp: cook phase 3.
- Nhắc trước khi mở public: backup Postgres ra ngoài VPS + thử restore (phase 17).

<!-- slug: giai-doan-1-doc-va-viet -->
