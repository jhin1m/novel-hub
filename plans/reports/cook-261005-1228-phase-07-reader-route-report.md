# Cook report — Phase 7: Trang đọc A (route, cache, giao diện)

Ngày: 2026-10-05. Plan: `plans/261004-1654-giai-doan-1-doc-va-viet/phase-07-trang-doc-route-giao-dien.md`. Checkbox 6 spec **chưa** đánh (phase 9 đánh).

## Đã làm

- **shared:** `canonicalPath()` + `CanonicalTarget` (6 kind; tag `page>1` → `?page=N`), `parseChapterNumber`/`parseChapterSegment` (từ chối 0, số 0 đầu, dấu, > 2^31-1).
- **core:** `access/can-read-chapter.ts` (`canReadChapter`, `isStoryPubliclyVisible`, `readableChapterWhere` dạng SQL nội bộ), `reader/get-chapter-for-reading.ts` (một join lấy facts + nội dung; prev/next bằng một câu `max/min case`; warning tag quy về canonical), `reader/toc.ts`, `users/preferences.ts` (`getPreferences`, giá trị hỏng → mặc định).
- **api:** `GET /api/v1/me` trả thêm `preferences` (thay đổi tương thích). Test signed-in chuyển sang `routes/me.int.test.ts` vì cần DB; `auth.int.test.ts` cập nhật kỳ vọng body.
- **web:**
  - Route `stories.$storyKey.chapter-{$number}.tsx` (prefix param chạy được, không cần fallback), server fn `server-fns/reader.ts` (`getChapterPage`, `getChapterToc`, `.validator()` Zod).
  - `lib/cache-headers.ts`, `lib/canonical.ts` (`assertCanonical`, `requestedHref`, `pathAndQuery`), `lib/route-signals.ts` (`throwNotFound`), `lib/boot-script.ts` (`BOOT_SCRIPT`, `syncMatureFlag`).
  - Hook `lib/reader/{use-nav-visibility,use-arrow-keys,use-prefetch-next}.ts`; component `components/reader/{reader-nav,chapter-toc-sheet,chapter-content,chapter-end,mature-gate}.tsx`; `styles/reader.css` (19px / 1.8 / 1em / 68ch, biến trên `:root` cho phase 8).
  - `__root.tsx`: `BOOT_SCRIPT` đầu `<head>`, `<html suppressHydrationWarning>`. `lib/me.ts`: đồng bộ cờ `nh:mature`.
- **i18n:** 20 key `reader_*`, `mature_*`.
- **docs:** `docs/deployment-cloudflare.md` (Cache Rule, cache key giữ query, URL Normalization, lệnh kiểm tra).
- **e2e:** `apps/web/e2e/reader.spec.ts` (10 test), helper `e2e/helpers/content.ts` (tạo tác giả/truyện/chương qua `core`).

## Spike (bước 1)

- Prefix param `chapter-{$number}`: chạy (route tree sinh `/stories/$storyKey/chapter-{$number}`, param `number`).
- `redirect({ href, statusCode: 301, headers })` trong loader SSR: status và header giữ nguyên.
- `location.searchStr` có, nhưng router **chuẩn hoá** location (decode path, bỏ `?` rỗng) → dùng URL thô của request (`getRequest().url` qua `createIsomorphicFn`) cho so khớp.
- Header route `headers()` được gọi cả khi loader `notFound()` (`loaderData` rỗng) → 404 nhận `s-maxage=60`.

## Kiểm thủ công trên bản build (`pnpm --filter @novel-hub/web build` + `node .output/server/index.mjs`)

| URL | Kết quả |
| --- | --- |
| URL chuẩn | 200, `public, s-maxage=86400, stale-while-revalidate=3600`, không `set-cookie` |
| `?a=1`, `?` rỗng, path chữ hoa | 301 → URL chuẩn, `no-store` |
| Sai slug | 301, `public, s-maxage=3600` |
| `/` cuối | 307 (router), không `cache-control` |
| `chapter-02`, chương không có | 404, `public, s-maxage=60` |
| Truyện 18+ | 200 + `x-robots-tag: noindex` |
| `%2D` thay `-` | **200** (xem lệch plan 2) |

Bundle client không chứa `drizzle-orm`/`pg-pool`/`ioredis`/code core (grep `.output/public`). Dev và build cho cùng kết quả, trừ `?` rỗng (dev: 200, build: 301 — dev server chuẩn hoá request trước).

## Lệch so với plan

1. **`/` cuối:** router của Start tự trả 307 về URL chuẩn trước khi chạy loader, không có `Cache-Control` → không phải 301 `s-maxage=3600` như plan. Vẫn giữ bất biến (không bao giờ 200, không chứa nội dung); Cloudflare với Edge TTL "bypass nếu không có header" không cache. Không đổi `trailingSlash` của router để tránh ảnh hưởng mọi route.
2. **Percent-encode ký tự không dành riêng (`%2D`):** Start decode path ngay cả trong `getRequest().url`, origin không phân biệt được → trả 200. Plan cho rằng "so khớp chuỗi tuyệt đối nên không bao giờ 200" — sai với framework này. Giảm thiểu: Cloudflare URL Normalization (mặc định bật) đưa về cùng cache key; đã ghi trong `docs/deployment-cloudflare.md`. E2E không thử `%2D`.
3. **Link chương** dùng `<a href={canonicalPath(...)}>` thay `<Link reloadDocument>`: cùng hiệu ứng (tải lại tài liệu) và giữ `canonicalPath` là nơi dựng URL duy nhất.
4. **Prefetch** kiểm tra vị trí theo scroll + rAF thay IntersectionObserver: nhảy qua sentinel (phím End, kéo thanh cuộn) không bao giờ giao nhau nên IO bỏ lỡ (e2e bắt được).
5. Loader dùng `parseChapterNumber` (param đã tách tiền tố); `parseChapterSegment` vẫn có cho fallback/nơi khác.

## Review

`code-reviewer-261005-1245-phase-07-reader-route-review-report.md`: 8/10 (0 Critical, 1 High, 2 Medium, 8 Low). Đã sửa:
- **H1:** loader lỗi (500) từng nhận `public, s-maxage=60` → `publicPageHeaders(match.status)` ở `lib/cache-headers.ts`: chỉ `success` cache dài, `notFound` 60s, còn lại `no-store` (unit test).
- **M1:** màn 18+ nhận focus khi hiện; `main` và `ReaderNav` dùng `inert` thay `aria-hidden`.
- **M2:** URL thô chỉ lấy ở server (`requestLocation`); trong browser dùng location của router.
- Low: comment server fn và truy vấn prev/next sai; `ReactNode` import; phím ←/→ không còn bị màn 18+ (đã ẩn bằng cờ) chặn; thanh điều hướng đang ẩn hiện lại khi có focus bàn phím.

Chưa sửa (Low, chấp nhận): mỗi lượt xem gọi `/me` (một truy vấn preferences cho user đã đăng nhập); đăng nhập từ màn 18+ quay về `/` thay vì chương; prefetch không kiểm lại khi resize; tag gộp chỉ theo một bước `canonical_id` (thiết kế gộp luôn trỏ về tag chuẩn).

## Gate

`pnpm typecheck` ✓ · `pnpm lint` ✓ · `pnpm test` 317/317 ✓ · `pnpm test:int` 157 ✓ (1 skip S3) · `pnpm test:e2e` 29/29 ✓ · `pnpm format:check` ✓.

## Câu hỏi chưa giải quyết

- Có muốn đổi `trailingSlash` router để `/` cuối nhận 301 có cache như plan không (ảnh hưởng mọi route)? Đề xuất: không.
