---
phase: 7
title: "Phase 7: Trang đọc A — route, cache, giao diện đọc"
status: pending
priority: P1
effort: "1.5d"
dependencies: [6]
---

# Phase 7: Trang đọc A — route, cache, giao diện đọc

Spec checkbox: `Trang đọc chương theo mục 6 và mục 8.` — **chưa đánh `[x]` ở phase này**; checkbox gồm phase 7, 8, 9 và chỉ đánh ở cuối phase 9. <!-- Red Team: tách phase trang đọc thành 3 phase -->

## Context Links

- Spec mục 4 (URL, 301 slug), 6 (cache, trang đọc), 7 (18+, `noindex`, cấm tác giả bị ban), 8 (khu đọc), 10 (`canReadChapter` là điểm duy nhất)
- [plan.md](./plan.md) — "Kiến trúc dữ liệu cho UI", "18+"
- `plans/reports/researcher-261004-2352-tanstack-start-ssr-ui-report.md` mục 1, 2, 3, 4, 7, 9
- Phase 1: preset `[data-reader-theme]`, `Sheet`, `NotFoundPage`. Phase 2: `parseStoryKey`, `getInfra()`, `makeTestApiDeps`, `validate()`/`coreError()`. Phase 5: `chapter_contents.html`, trạng thái `published`.
- Code: `apps/web/src/routes/__root.tsx:31-43` (`RootDocument`), `apps/web/src/lib/me.ts:12-22` (`useMe`), `packages/api/src/routes/me.ts:7-12`, `packages/shared/src/schemas/preferences.ts:7-10`, `packages/core/src/users/current-user.ts:7-13`

## Overview

- **A. Đọc + cache:** `core/access.canReadChapter`, core `reader`, server fn `getChapterPage`, route `/stories/$storyKey/chapter-$n`; header cache công khai, 301 về URL chuẩn (slug, chữ hoa, query lạ), 404 cache ngắn; tài liệu Cloudflare Cache Rule.
- **B. UI đọc:** thanh điều hướng ẩn/hiện, mục lục, chương trước/sau bằng link tài liệu, phím ←/→, prefetch HTML chương sau ở ~70%, cuối chương, màn cảnh báo 18+ (chỉ phần hiển thị; nút bật 18+ ở phase 8).
- Ngoài phạm vi (phase sau): bảng tuỳ chỉnh đọc + `PATCH /me/preferences` (phase 8); tiến độ đọc, purge CDN, đếm lượt đọc (phase 9).

## Key Insights

- **Bất biến cache:** mọi response 200 có nội dung chương nằm đúng URL chuẩn `/stories/{slug}-{publicId}/chapter-{n}` (chữ thường, không query, không `/` cuối). Mọi biến thể khác → 301 hoặc 404, không bao giờ 200. Purge chỉ chạm URL chuẩn, nên biến thể không được giữ nội dung. <!-- Red Team: X1 query-string/case variants -->
- **Cache key giữ query string (mặc định của Cloudflare), không bỏ qua.** Nếu bỏ query thì 301 của `/x?a=1` bị cache dưới key của `/x` → vòng redirect, và `?page=2` của trang tag nhận nhầm trang 1. Giữ query trong key thì biến thể chỉ cache phản hồi 301 (không chứa nội dung), purge không cần chạm tới. <!-- Red Team: X1 — sửa theo coordinator: không bỏ query khỏi cache key -->
- **301 nào được cache:** chỉ cache 301 (`REDIRECT_CACHE`) khi `lowercase(path)` khác URL chuẩn (sai slug — key khác hẳn URL chuẩn); chỉ khác chữ hoa hoặc chỉ khác query → `NO_STORE`. Phòng thủ thêm: không phụ thuộc việc Cloudflare phân biệt hoa/thường trong key, và vẫn an toàn nếu sau này ai đó bật bỏ query; biến thể kiểu này hiếm nên tốn origin không đáng kể.
- **Liên kết giữa các trang công khai là link tài liệu** (`<Link reloadDocument>`, phím ← → dùng `location.assign`): mọi lượt xem đi qua HTML đã cache ở CDN, không chạy loader phía client (không RPC `/_serverFn` lách cache). <!-- Red Team: X1 -->
- **Prefetch** bằng `<link rel="prefetch" href>` tới URL chuẩn chương sau (làm ấm cache CDN và trình duyệt), không `router.preloadRoute`. <!-- Red Team: X1 -->
- **HTML không phụ thuộc cookie:** route đọc và server fn không gọi `getSession`; mọi thứ cá nhân chạy ở client qua `/api/v1/*`. E2E kiểm không có `Set-Cookie`.
- **Một hàm dựng URL chuẩn** `canonicalPath` ở `packages/shared` (core và web cùng import): đích 301, URL purge, canonical, sitemap không bao giờ lệch nhau. <!-- Red Team: consistency sweep — hàm URL chuẩn dùng chung cho phase 9, 10, 12, 16 -->
- Header cache đặt ở **route lá** bằng option `headers` đọc `loaderData` (research mục 1). Hằng ở `apps/web/src/lib/cache-headers.ts`; phase 10 dùng lại.
- **Route chương:** thử prefix param `stories.$storyKey.chapter-{$number}.tsx`; không chạy thì fallback `stories.$storyKey.$chapterSlug.tsx` + `parseChapterSegment`. Số sai dạng (có số 0 đầu, không phải số) → `notFound()`.
- **Tác giả bị ban:** một cơ chế duy nhất — `canReadChapter`/`isStoryPubliclyVisible` lọc `users.status != 'banned'`; phase 15 ban chỉ đổi status, không ẩn truyện hàng loạt. Phase 10 `publicStoryWhere` cùng điều kiện. <!-- Red Team: S6/X5 một cơ chế ban -->
- **18+:** SSR luôn render màn cảnh báo đè lên nội dung truyện `is_mature`; client gỡ khi `useMe().preferences.showMature`. Script boot đọc cờ `localStorage['nh:mature']` → `data-mature-ok` trên `<html>` để người đã bật không bị nháy. Cờ chỉ là gợi ý hiển thị, không phải kiểm soát truy cập.
- Bỏ bước ESLint chặn `@tiptap/*`: phase 4 đã gộp vào block `no-restricted-imports` hiện có. Phase này không sửa `eslint.config.js`. <!-- Red Team: S3 -->

## Requirements

**Functional**

- `canReadChapter(user, chapter)` đọc được khi: chương `published`, `deleted_at IS NULL`; truyện `visibility = 'published'`; tác giả `status != 'banned'`. Trả `{ readable: true, publicCache: true } | { readable: false }`; `user` chưa dùng (giữ chỗ paywall).
- `GET /stories/{slug}-{publicId}/chapter-{n}`:
  - 200: HTML chương trong SSR, `Cache-Control: public, s-maxage=86400, stale-while-revalidate=3600`; <!-- Red Team: X1 giảm SWR -->
  - sai slug hoặc có `/` cuối (path đã lowercase vẫn khác URL chuẩn) → 301 tới URL chuẩn, `public, s-maxage=3600`;
  - chỉ khác chữ hoa hoặc chỉ khác query → 301 tới URL chuẩn, `no-store`;
  - không đọc được hoặc không tồn tại → 404, `public, s-maxage=60`.
- Truyện 18+: `<meta name="robots" content="noindex">` + header `X-Robots-Tag: noindex`.
- `head()`: title `{tên chương} – {tên truyện}`, canonical tuyệt đối (APP_URL qua loader data). Phase 16 hoàn thiện OG.
- Trang đọc không dùng `SiteLayout`. Thanh điều hướng: tên chương, chương trước/sau, mục lục (nút cài đặt do phase 8 thêm). Ẩn khi cuộn xuống, hiện khi cuộn lên hoặc chạm giữa màn hình.
- Mục lục: `Sheet`, tải lười qua server fn `getChapterToc` khi mở, đánh dấu chương hiện tại, link về trang truyện; mọi link `reloadDocument`.
- Cuối chương: nút "Chương tiếp" to (hoặc "Đã hết chương mới"), lời nhắn tác giả (plain text, React escape, `white-space: pre-line`). Chỗ bình luận để trống (Giai đoạn 2).
- Phím ←/→ chuyển chương; bỏ qua khi focus input/textarea/contenteditable, có modifier, hoặc đang mở dialog/sheet.
- Màn cảnh báo 18+: tên truyện + tag `warning`; khách: nút đăng nhập; đã đăng nhập chưa bật: dòng hướng dẫn (nút bật + xác nhận thêm ở phase 8).
- `GET /api/v1/me` trả thêm `preferences` (parse qua `userPreferencesSchema`).
- `docs/deployment-cloudflare.md`: Cache Rule áp lúc deploy. <!-- Red Team: X1 -->

**Non-functional**

- Chữ mặc định 18–20px (mobile), line-height 1.75–1.9, cột 60–75 ký tự (desktop) qua token phase 1.
- `prefers-reduced-motion`: thanh điều hướng không animate. Không thanh tiến trình chuyển trang; không chèn gì giữa nội dung.
- Mọi chuỗi qua Paraglide; không UUID trong HTML/loader data.

## Architecture

```
Browser ─GET /stories/kiem-dao-k7m2xq9p/chapter-3─▶ CDN (Cache Rule) ─miss─▶ Start route (SSR)
  loader({ params, location }):
    parseStoryKey(lowercase) → parseChapterSegment → getChapterPage({ publicId, number })  [server-fns/reader.ts]
       └▶ core/reader.getChapterForReading(db, publicId, number)
             ├ join stories + users(author) + chapters + chapter_contents
             ├ canReadChapter(null, facts) → không → null → notFound()
             └ prev/next: số chương đọc được gần nhất < n và > n
    assertCanonical(location, canonicalPath) → redirect 301 (REDIRECT_CACHE | NO_STORE)
  headers(loaderData): PUBLIC_CACHE (+ X-Robots-Tag) | NOT_FOUND_CACHE
Client: ReaderPage
  ├ ReaderNav (ẩn/hiện) ── link reloadDocument prev/next ── ChapterTocSheet (useQuery → getChapterToc)
  ├ ChapterContent (dangerouslySetInnerHTML html đã sanitize) + sentinel 70% → <link rel="prefetch">
  ├ ChapterEnd ── MatureGate (SSR luôn render khi isMature; client gỡ)
  └ useArrowKeys → location.assign(urlChuẩn)
```

```ts
// packages/core/src/access/can-read-chapter.ts
export interface ReadableChapterFacts {
  status: ChapterStatus; deletedAt: Date | null;
  story: { visibility: StoryVisibility; authorStatus: UserStatus };
}
export type ReadDecision = { readable: true; publicCache: boolean } | { readable: false };
export function isStoryPubliclyVisible(s: ReadableChapterFacts['story']): boolean;
export function canReadChapter(user: PolicyUser | null, chapter: ReadableChapterFacts): ReadDecision;

// packages/core/src/reader/get-chapter-for-reading.ts
export interface ChapterPageData {
  story: { publicId: string; slug: string; title: string; isMature: boolean;
    authorUsername: string; authorDisplayName: string; warningTags: { slug: string; name: string }[] };
  chapter: { number: number; title: string | null; authorNote: string | null; html: string; wordCount: number; publishedAt: Date };
  prevNumber: number | null; nextNumber: number | null;
}
export function getChapterForReading(db: Db, publicId: string, number: number): Promise<ChapterPageData | null>;
export function listReadableChapters(db: Db, storyId: string): Promise<{ number: number; title: string | null; publishedAt: Date }[]>;
export function getChapterToc(db: Db, publicId: string): Promise<{ number: number; title: string | null }[] | null>;

// packages/shared/src/canonical-path.ts — nguồn DUY NHẤT dựng URL chuẩn (path tương đối, chữ thường, không `/` cuối).
// Đích 301 (phase 7, 10), purge (phase 9 `urlsFor`, phase 10 `catalogUrls`), "Đọc tiếp" (phase 12), canonical + sitemap (phase 16) đều gọi hàm này.
export type CanonicalTarget =
  | { kind: 'home' }
  | { kind: 'story'; slug: string; publicId: string }
  | { kind: 'chapter'; slug: string; publicId: string; number: number }
  | { kind: 'author'; username: string }
  | { kind: 'tag'; slug: string; page?: number }            // page > 1 → `?page=N`, còn lại không query
  | { kind: 'static'; path: '/terms' | '/content-policy' };
export function canonicalPath(t: CanonicalTarget): string;
// apps/web/src/lib/canonical.ts — phase 10 dùng lại
export function assertCanonical(location: { pathname: string; searchStr: string }, canonical: string): void; // canonical = canonicalPath(...); khác → throw redirect 301
// apps/web/src/lib/cache-headers.ts
export const PUBLIC_CACHE, NOT_FOUND_CACHE, REDIRECT_CACHE, NO_STORE: Record<string, string>;
```

## File Inventory

| File | Action | Ghi chú |
|---|---|---|
| `packages/shared/src/schemas/reader.ts` (+ test) | create | `parseChapterSegment`; phase 8 thêm settings |
| `packages/shared/src/canonical-path.ts` (+ test), `src/index.ts` | create/modify | `canonicalPath`, `CanonicalTarget` (dùng cả ở core lẫn web) |
| `packages/core/src/access/can-read-chapter.ts` (+ test) | create | |
| `packages/core/src/reader/{get-chapter-for-reading,toc}.ts` (+ `reader.int.test.ts`) | create | |
| `packages/core/src/users/preferences.ts` (+ int test) | create | `getPreferences(db, userId)`; phase 8 thêm `updatePreferences` |
| `packages/core/src/index.ts` | modify | export access, reader, preferences |
| `packages/api/src/routes/me.ts` (+ test) | modify | `GET /` trả `preferences` |
| `apps/web/src/server-fns/reader.ts` | create | `getChapterPage`, `getChapterToc` (GET + Zod), dùng `getInfra()` |
| `apps/web/src/lib/cache-headers.ts` (+ test) | create | |
| `apps/web/src/lib/canonical.ts` (+ test) | create | |
| `apps/web/src/lib/boot-script.ts` (+ test) | create | `BOOT_SCRIPT` chuỗi tĩnh: cờ `nh:mature`; phase 8 mở rộng |
| `apps/web/src/lib/reader/{use-arrow-keys,use-prefetch-next,use-nav-visibility}.ts` | create | |
| `apps/web/src/components/reader/{reader-nav,chapter-toc-sheet,chapter-content,chapter-end,mature-gate}.tsx` | create | `MatureGate` phase 10 dùng lại |
| `apps/web/src/routes/stories.$storyKey.chapter-{$number}.tsx` | create | hoặc fallback `$chapterSlug` |
| `apps/web/src/routes/__root.tsx` | modify | `BOOT_SCRIPT` đầu `<head>`, `<html suppressHydrationWarning>` |
| `apps/web/src/styles/reader.css` (import trong `app.css`) | create | `.reader-content`, cột chữ, ẩn `MatureGate` khi `[data-mature-ok]` |
| `apps/web/src/lib/me.ts` | modify | type có `preferences`; đặt/xoá cờ `nh:mature` |
| `packages/shared/messages/vi.json` | modify | `reader_*`, `mature_*` |
| `docs/deployment-cloudflare.md` | create | Cache Rule HTML; phase 9 thêm mục purge token |
| `apps/web/e2e/reader.spec.ts`, `apps/web/e2e/helpers/content.ts` | create/modify | helper gọi core tạo tác giả/truyện/chương đã đăng |

## Implementation Steps

1. **Spike 30 phút:** prefix param `chapter-{$number}`; `redirect({ href, statusCode: 301, headers })` trong loader SSR; `location.searchStr` có trong loader ctx. Ghi kết quả vào báo cáo cook; prefix không chạy → fallback `$chapterSlug`.
2. **Shared:** `parseChapterSegment('chapter-12') → 12 | null` (từ chối `0`, số 0 đầu, > 2^31); `canonicalPath` đủ 6 `kind` (tag `page` 1/undefined → không query, 2 → `?page=2`). Unit test biên.
3. **Core `access`:** `isStoryPubliclyVisible`, `canReadChapter`; unit test đủ tổ hợp (status × deleted × visibility × authorStatus).
4. **Core `reader`:**
   - `getChapterForReading`: một truy vấn join lấy facts + nội dung; `canReadChapter`; prev/next = `max(number) < n` / `min(number) > n` với cùng điều kiện đọc được (index `(story_id, status, number)`);
   - `warningTags`: tag `kind = 'warning'` đã quy về canonical;
   - `listReadableChapters`, `getChapterToc`. Int test trên DB thật.
5. **Core `getPreferences`** + `GET /me` trả `preferences`; test api dựng app bằng `makeTestApiDeps`.
6. **Cache + canonical:**
   - `cache-headers.ts`: `PUBLIC_CACHE` (`public, s-maxage=86400, stale-while-revalidate=3600`), `NOT_FOUND_CACHE` (`public, s-maxage=60`), `REDIRECT_CACHE` (`public, s-maxage=3600`), `NO_STORE`;
   - `assertCanonical(location, canonicalPath({ kind: 'chapter', … }))`: `pathname + searchStr !== canonical` → `throw redirect({ href: canonical, statusCode: 301, headers: pathname.toLowerCase() !== canonical ? REDIRECT_CACHE : NO_STORE })`. Unit test bảng biến thể.
7. **Server fn + route:**
   - `server-fns/reader.ts`: `createServerFn({ method: 'GET' }).inputValidator(zod)`; trả `appUrl` để `head()` dựng canonical;
   - loader: lowercase `storyKey` → `parseStoryKey` → `parseChapterSegment` → server fn → `null` thì `notFound()` → `assertCanonical`;
   - `headers({ loaderData })`: có data → `PUBLIC_CACHE` (+ `X-Robots-Tag` khi `isMature`); không → `NOT_FOUND_CACHE`;
   - `head()`: title, canonical, robots `noindex` khi `isMature`; `notFoundComponent` dùng `NotFoundPage` của phase 1.
8. **UI đọc:**
   - `ChapterContent` + `reader.css`; `ReaderNav` (passive scroll + rAF, `data-hidden`, chạm giữa màn hình toggle);
   - link prev/next/mục lục/trang truyện: `<Link reloadDocument>`; `useArrowKeys` → `window.location.assign(canonicalPath({ kind: 'chapter', … }))`;
   - `usePrefetchNext`: IntersectionObserver trên sentinel ở `top: 70%` khối nội dung → chèn `<link rel="prefetch" href={urlChuẩn}>` một lần;
   - `ChapterTocSheet` (`useQuery` gọi `getChapterToc` khi mở), `ChapterEnd`.
9. **18+:** `BOOT_SCRIPT` (try/catch, đọc `nh:mature` → `data-mature-ok`) chèn đầu `<head>`; `MatureGate` SSR render overlay + `aria-hidden` cho nội dung; client `useMe` → `preferences.showMature` thì gỡ và đặt `nh:mature=1`, khách hoặc tắt thì xoá cờ.
10. **i18n:** `reader_prev`, `reader_next`, `reader_toc`, `reader_toc_story`, `reader_end_next`, `reader_end_latest`, `reader_author_note`, `mature_title`, `mature_warning_tags`, `mature_sign_in`, `mature_enable_hint`; `pnpm i18n:compile`.
11. **Tài liệu Cloudflare** `docs/deployment-cloudflare.md`:
    - Cache Rule "Eligible for cache" chỉ cho HTML route công khai (`/`, `/stories/*`, `/authors/*`, `/tags/*`, `/terms`, `/content-policy`);
    - Edge TTL: dùng header origin; cache key: **giữ mặc định (query string nằm trong key), không bật "Ignore query string"** — ghi rõ lý do (vòng 301, `?page=2` nhận nhầm trang 1);
    - loại trừ `/api/*`, `/_serverFn/*`, `/write/*`, `/moderation*`, `/library*`, `/settings*`, trang auth;
    - kiểm tra sau khi áp: `curl -I` URL chuẩn hai lần thấy `cf-cache-status: HIT`; `?utm=x` trả 301 về URL chuẩn (không phải 200); `/tags/x?page=2` khác nội dung trang 1.
12. **E2E `reader.spec.ts`** theo ma trận. Header kiểm bằng `request.get(url, { maxRedirects: 0 })`. Kiểm thủ công header trên bản build (`pnpm --filter @novel-hub/web build` + start) một lần, ghi vào báo cáo cook.
13. **Gate:** `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e`. **Không** đánh `[x]` checkbox 6 (đánh ở phase 9).

## Function / Interface Checklist

- [ ] `canReadChapter`, `isStoryPubliclyVisible`
- [ ] `getChapterForReading`, `listReadableChapters`, `getChapterToc`, `getPreferences`
- [ ] `getChapterPage`, `getChapterToc` (server fn)
- [ ] `parseChapterSegment`, `canonicalPath`, `CanonicalTarget`, `assertCanonical`
- [ ] `PUBLIC_CACHE`, `NOT_FOUND_CACHE`, `REDIRECT_CACHE`, `NO_STORE`, `BOOT_SCRIPT`
- [ ] `useArrowKeys`, `usePrefetchNext`, `useNavVisibility`
- [ ] `ReaderNav`, `ChapterTocSheet`, `ChapterContent`, `ChapterEnd`, `MatureGate`

## Test Scenario Matrix

| Mức | Kịch bản | Loại |
|---|---|---|
| Critical | `canReadChapter`: draft/scheduled/hidden_by_mod/xoá mềm/truyện draft/truyện hidden_by_mod/tác giả banned → không; published hợp lệ → đọc được + `publicCache` | unit |
| Critical | `getChapterForReading` bỏ qua chương xoá mềm/chưa đăng/bị ẩn khi tính prev/next; tác giả banned → `null` | int |
| Critical | Tắt JS → HTML có nội dung chương (đoạn có `data-pid`) | e2e |
| Critical | 200 có `cache-control` chứa `s-maxage=86400`, không có `set-cookie` (khách và khi gửi kèm cookie phiên) | e2e |
| Critical | Biến thể `?a=1`, `?utm_source=x`, path chữ hoa → 301 tới URL chuẩn với `cache-control: no-store`; `/` cuối → 301 `s-maxage=3600`; không biến thể nào trả 200 | e2e + unit `assertCanonical` |
| Critical | Sai slug → 301 `s-maxage=3600`; chương nháp/không tồn tại/số `chapter-03` → 404 `s-maxage=60` | e2e |
| High | Truyện 18+: khách thấy màn cảnh báo + tag warning + `noindex` (meta và header); user có `showMature` (đặt qua helper DB) thấy nội dung | e2e |
| High | `GET /me` có `preferences.showMature`; khách 401 | unit api |
| High | Phím → sang chương tiếp (document mới); khi mở sheet mục lục thì không chuyển | e2e |
| High | Link chương sau là điều hướng tài liệu (request document mới, không request `/_serverFn`) | e2e |
| Medium | Cuộn qua 70% → DOM có `link[rel=prefetch][href=<chương sau>]` | e2e |
| Medium | `BOOT_SCRIPT` với localStorage ném lỗi → không throw | unit (chạy chuỗi trong `new Function` với fake `localStorage`/`document`) |
| Medium | Lời nhắn tác giả chứa `<b>` → hiển thị nguyên văn | e2e |

## Dependency Map

- **Cần:** phase 1 (token, `Sheet`, `NotFoundPage`), phase 2 (`parseStoryKey`, `getInfra()`, `makeTestApiDeps`, `createMeRoutes(deps)`), phase 5 (`chapter_contents`, chương `published`), phase 6 (xong gate).
- **Phase sau dùng:**
  - phase 8: `ReaderNav` (thêm nút cài đặt), `BOOT_SCRIPT`, `MatureGate` (thêm nút bật), `getPreferences`;
  - phase 9: `canReadChapter`, `getChapterForReading`, route chương (gắn tiến độ/lượt đọc), `canonicalPath` (`urlsFor`), `docs/deployment-cloudflare.md`;
  - phase 10: `isStoryPubliclyVisible`, `listReadableChapters`, `MatureGate`, `cache-headers`, `assertCanonical`, `canonicalPath`, `getPreferences`;
  - phase 12: route chương (khôi phục vị trí), `canonicalPath`; phase 16: `head()`, `canonicalPath` cho canonical + sitemap, sitemap qua `canReadChapter`.

## Success Criteria

- [ ] Trang chương SSR đủ nội dung, `Cache-Control` công khai, không cookie
- [ ] Mọi biến thể URL không chuẩn → 301/404, không 200; 301 do query/chữ hoa không được cache
- [ ] Điều hướng, mục lục, phím, prefetch HTML, cuối chương chạy đúng; link công khai là link tài liệu
- [ ] Màn cảnh báo 18+ ở client, `noindex` cho truyện 18+
- [ ] `docs/deployment-cloudflare.md` có Cache Rule
- [ ] Gate 5 lệnh xanh; checkbox 6 **chưa** đánh

## Risk Assessment

| Rủi ro | Khả năng × Ảnh hưởng | Giảm thiểu |
|---|---|---|
| Biến thể URL giữ nội dung đã ẩn quá TTL | Trung bình × Cao | `assertCanonical` (biến thể chỉ nhận 301/404); e2e bảng biến thể <!-- Red Team: X1 --> |
| 301 cache dưới key URL chuẩn → vòng redirect | Thấp × Cao | Cache key giữ query (không bật bỏ query); 301 do query/chữ hoa trả `no-store`; e2e kiểm header |
| Prefix param `chapter-{$number}` không chạy | Trung bình × Thấp | Spike bước 1; fallback `$chapterSlug` |
| Header cache khác giữa `vite dev` và bản build | Trung bình × Cao | Kiểm thủ công bản build, ghi báo cáo cook |
| `location.pathname` đã decode → bỏ sót biến thể percent-encode | Thấp × Trung bình | Biến thể lạ chỉ sinh 301/404 (không bao giờ 200 vì so khớp chuỗi tuyệt đối); e2e thử `%2D` |
| Trình duyệt dùng SWR 1 giờ cho trang đã xem | Thấp × Thấp | SWR chỉ 1 giờ; chấp nhận |
| Hydration mismatch do script boot đổi attribute | Trung bình × Trung bình | Render đầu không phụ thuộc cài đặt; `suppressHydrationWarning` trên `<html>` |

Rollback: không migration, không job; gỡ route + component là về trạng thái phase 6. `GET /me` thêm field là thay đổi tương thích.

## Security Considerations

- HTML chương đã sanitize lúc đăng (phase 5); trang đọc chỉ `dangerouslySetInnerHTML` cột `html` từ DB. Lời nhắn tác giả render như text.
- Không UUID trong loader data/HTML; server fn chỉ nhận `publicId` + `number`, validate Zod.
- Nội dung chương bị ẩn/tác giả bị ban → 404 ngay ở origin; CDN dựa vào purge (phase 9) và TTL.
- Cờ `nh:mature` chỉ điều khiển hiển thị; danh sách SSR không bao giờ chứa truyện 18+ (phase 10).

## Câu hỏi mở (đã chốt — Validation Session 1, 2026-10-05)

1. Giữ header `s-maxage` + `stale-while-revalidate`; gói Cloudflare không tôn trọng SWR cũng không đổi header (kiểm lúc deploy).

## Next Steps

Phase 8: bảng tuỳ chỉnh đọc, script boot đầy đủ, `PATCH /api/v1/me/preferences`, nút bật 18+ trong `MatureGate`.
