---
phase: 12
title: "Phase 12: Tủ truyện và lịch sử đọc"
status: pending
priority: P1
effort: "1.5d"
dependencies: [11]
---

# Phase 12: Tủ truyện và lịch sử đọc

Spec checkbox: `Tủ truyện và lịch sử đọc, nút đọc tiếp.`

## Context Links

- Spec mục 4 (`library_items`: shelf reading/plan/done/dropped; `reading_progress`: đọc tiếp + nguồn thống kê bỏ dở), mục 6 (phần cá nhân hoá tải riêng ở client qua API không cache)
- [plan.md](./plan.md) — "Kiến trúc dữ liệu cho UI" (dữ liệu cá nhân = Hono + `hc` + TanStack Query, `no-store`)
- Schema: `packages/db/src/schema/engagement.ts:20-60` (`libraryItems` PK `(user_id, story_id)`; `readingProgress` PK `(user_id, story_id)`, index `reading_progress_user_id_updated_at_idx` `(user_id, updated_at DESC)`)
- `apps/web/src/router.tsx:5` (`scrollRestoration: true`)
- Phase 7: trang chương, `canReadChapter`, link tài liệu thường. Phase 9: `saveReadingProgress`, `packages/api/src/routes/reading.ts` (`PUT|POST /api/v1/reading/progress`), `computeScrollPct` (`apps/web/src/lib/reader/scroll.ts`), `useReadingProgress`. Phase 10: trang truyện, `StoryCardDto`, `storyCardColumns`, `StoryCard`, `publicStoryWhere`. Phase 2: `validate()`, `coreError()`, `Result`, `makeTestApiDeps` <!-- Red Team: tiến độ đọc nằm ở phase 9 sau khi tách phase 7 -->

## Overview

- **Core:**
  - `library`: thêm/chuyển kệ/bỏ khỏi tủ, liệt kê theo kệ;
  - `history`: lịch sử đọc từ `reading_progress`, mới nhất trước, xoá một mục;
  - `continueReading`: chương + `scroll_pct` để đọc tiếp.
- **Hono:** sub-app `library` (mới); mở rộng sub-app `reading` của phase 9: `GET` tiến độ, lịch sử, xoá lịch sử.
- **Web:**
  - `/tu-truyen`: tab 4 kệ + "Lịch sử";
  - trang truyện thêm nút "Thêm vào tủ" và nút "Đọc tiếp chương N" (client, cá nhân hoá);
  - mở chương từ "Đọc tiếp" thì khôi phục vị trí cuộn.

## Key Insights

- **Trang truyện giữ cache công khai:** SSR luôn render "Đọc từ đầu" (phase 10); client có user + tiến độ thì đổi thành "Đọc tiếp chương N"; nút tủ truyện SSR ở trạng thái trung tính, client tải trạng thái thật.
- **Điều hướng tới trang công khai là tải tài liệu** (`reloadDocument`, quy tắc phase 7/10): mục trong `/tu-truyen`, lịch sử và nút "Đọc tiếp" đều mở trang truyện/chương bằng điều hướng tài liệu để đi qua HTML cache CDN. <!-- Red Team: link tài liệu thường -->
- **Khôi phục vị trí cuộn:**
  - không dùng query string trên URL chương: `assertCanonical` của phase 7 sẽ 301 bỏ query, và URL chia sẻ không được mang vị trí; <!-- Red Team: canonical query -->
  - dùng handoff `sessionStorage['nh:resume'] = { publicId, number, scrollPct, at }` (sessionStorage còn qua điều hướng tài liệu trong cùng tab);
  - nút "Đọc tiếp" ghi handoff rồi điều hướng tài liệu; trang chương khi mount đọc, khớp `publicId` + `number` và `at` < 60s thì cuộn tới vị trí rồi xoá;
  - quy đổi phần trăm ↔ toạ độ bằng cùng module với phase 9 (`lib/reader/scroll.ts`).
- Router bật `scrollRestoration: true` (`apps/web/src/router.tsx:5`). Phải cuộn **sau** khi router khôi phục cuộn (sau `useLayoutEffect` + một `requestAnimationFrame`), nếu không bị ghi đè. Kiểm bằng e2e.
- **Chương trong tiến độ có thể không còn đọc được** (xoá mềm, mod ẩn): `continueReading` lấy chương đọc được gần nhất có `number ≤` chương cũ, không có thì chương đầu, đặt `scrollPct = 0` khi đổi chương.
- **Truyện không còn công khai** (ẩn, tác giả bị ban — lọc bằng `publicStoryWhere`, cơ chế ban duy nhất): không hiện trong tủ và lịch sử, nhưng **không xoá dòng**, để khi khôi phục/bỏ ban thì quay lại. <!-- Red Team: một cơ chế ban -->
- **Không tự thêm vào tủ khi đọc:** lịch sử đã ghi việc đọc; tủ do người đọc chủ động chọn (câu hỏi mở 1).
- Truyện 18+ trong tủ/lịch sử vẫn hiện (danh sách riêng, spec mục 7 không liệt kê). Mở ra vẫn qua `MatureGate`.
- **Phân trang:** lịch sử keyset `(updated_at, public_id)` theo index sẵn có; tủ phân trang offset (ít dòng mỗi user).
- **Rate limit:** phase 13 không có action riêng cho tủ truyện/tiến độ; endpoint chỉ ghi dữ liệu của chính user, không tạo nội dung công khai. <!-- Red Team: phase 13 bỏ action reading -->

## Requirements

**Functional**

- **Tủ truyện (`/api/v1/library`, cần đăng nhập, `no-store`):**
  - `GET /api/v1/library?shelf=reading&page=1` → `{ items: [{ story: StoryCardDto, shelf, addedAt, progress: { chapterNumber, scrollPct } | null }], page, totalPages }`, sắp `added_at DESC`;
  - `GET /api/v1/library/:publicId` → `{ shelf: Shelf | null }`;
  - `PUT /api/v1/library/:publicId` body `{ shelf }` → upsert (đổi kệ thì `added_at` giữ nguyên) → `{ shelf }`; truyện không công khai → 404 `NOT_FOUND`;
  - `DELETE /api/v1/library/:publicId` → 204, idempotent.
- **Tiến độ và lịch sử (`/api/v1/reading`, cần đăng nhập, `no-store`):**
  - `GET /api/v1/reading/progress/:publicId` → `{ progress: { chapterNumber, chapterTitle, scrollPct, updatedAt } | null }` (đã quy về chương đọc được);
  - `GET /api/v1/reading/history?cursor=` → `{ items: [{ story: StoryCardDto, chapterNumber, chapterTitle, scrollPct, updatedAt }], nextCursor }`, 20 mục/trang;
  - `DELETE /api/v1/reading/history/:publicId` → 204 (xoá dòng `reading_progress`).
- **`/tu-truyen`:** tab Đang đọc, Dự định, Đã xong, Bỏ dở, Lịch sử; tab trong search param `ke` (`validateSearch` + `.catch('reading')`); mỗi mục có `StoryCard` gọn + "Đọc tiếp chương N" (nếu có tiến độ) + menu đổi kệ/bỏ khỏi tủ; lịch sử có "Xoá khỏi lịch sử" + "Tải thêm"; khách → lời mời đăng nhập. Header `NO_STORE`, meta `noindex`.
- **Trang truyện (phase 10):** nút tủ: chưa có → "Thêm vào tủ" (kệ Đang đọc), có → nhãn kệ + dropdown đổi kệ/bỏ; khách bấm → `/dang-nhap` (có `redirect` quay lại nếu auth đã hỗ trợ, không thì về trang chủ); "Đọc tiếp chương N" thay "Đọc từ đầu" khi có tiến độ.
- **Trang chương (phase 7):** khôi phục vị trí từ handoff; không có handoff thì từ đầu chương.
- Header site: link "Tủ truyện" khi đã đăng nhập (trang cá nhân, điều hướng SPA được).

**Non-functional**

- Không UUID trong response; khoá truyện ra ngoài là `publicId`.
- Danh sách tủ một truy vấn (join story card + left join progress), không N+1.
- Mọi chuỗi UI qua Paraglide.

## Architecture

```
Trang truyện (SSR cache) ── client ──▶ useMe → có user:
   ├ useQuery GET /api/v1/library/:publicId          → LibraryButton
   └ useQuery GET /api/v1/reading/progress/:publicId → ContinueReadingButton
        click → setResumeHandoff({ publicId, number, scrollPct }) → location.assign(canonicalPath({ kind: 'chapter', … }))

Trang chương (phase 7) ── mount ──▶ takeResumeHandoff(publicId, number)
        → chờ layout + rAF (+ document.fonts.ready ≤ 500 ms) → window.scrollTo(pctToScrollY(contentEl, scrollPct))

/tu-truyen?ke=reading ──▶ useQuery GET /api/v1/library?shelf=…  |  useInfiniteQuery GET /api/v1/reading/history

packages/api routes/library.ts (mới), routes/reading.ts (phase 9, thêm GET/DELETE)
  → sessionMiddleware → requireAuth → validate() → core/library | core/reading → Result → coreError()
packages/core/src/library/library.ts, src/reading/history.ts, src/reading/continue.ts
```

```ts
// packages/shared/src/schemas/library.ts
export const SHELVES = ['reading', 'plan', 'done', 'dropped'] as const;
export const shelfSchema = z.enum(SHELVES);
export const libraryListQuery = z.object({ shelf: shelfSchema, page: z.coerce.number().int().min(1).max(500).catch(1) });
export const historyCursorSchema = z.string().regex(/^\d{13}_[a-z2-9]{8}$/).optional(); // `${updatedAtMs}_${publicId}`

// packages/core — lỗi theo Result của phase 2
export function setShelf(db, userId: string, publicId: string, shelf: Shelf): Promise<Result<{ shelf: Shelf }, 'NOT_FOUND'>>;
export function removeFromLibrary(db, userId: string, publicId: string): Promise<void>;
export function getShelf(db, userId: string, publicId: string): Promise<Shelf | null>;
export function listLibrary(db, userId: string, q: { shelf: Shelf; page: number }): Promise<Paged<LibraryItemDto>>;
export function listHistory(db, userId: string, cursor?: string, limit?: number): Promise<{ items: HistoryItemDto[]; nextCursor: string | null }>;
export function removeFromHistory(db, userId: string, publicId: string): Promise<void>;
export function getContinueReading(db, userId: string, publicId: string): Promise<ContinueDto | null>;
export function resolveReadableChapter(db, storyId: string, number: number): Promise<{ number; title; sameChapter: boolean } | null>;

// apps/web/src/lib/reader/scroll.ts (phase 9 tạo computeScrollPct)
export function pctToScrollY(contentEl: HTMLElement, pct: number): number;
// apps/web/src/lib/reader/resume-handoff.ts
export function setResumeHandoff(h: { publicId: string; number: number; scrollPct: number }): void;
export function takeResumeHandoff(publicId: string, number: number, now?: number): number | null;
```

Cursor lịch sử dùng `publicId` thay `story_id`: so `(rp.updated_at, s.public_id) < (t, pid)`, sắp theo cùng cặp. `public_id` unique nên thứ tự toàn phần.

## File Inventory

| File | Action | Ghi chú |
|---|---|---|
| `packages/shared/src/schemas/library.ts` (+ test) | create | `SHELVES`, `shelfSchema`, `libraryListQuery`, `historyCursorSchema`; export ở `index.ts` |
| `packages/core/src/library/library.ts` (+ `.test.ts`, `.int.test.ts`) | create | |
| `packages/core/src/reading/history.ts` (+ int test) | create | |
| `packages/core/src/reading/continue.ts` (+ int test) | create | `resolveReadableChapter` dùng chung |
| `packages/core/src/index.ts` | modify | export |
| `packages/api/src/routes/library.ts` (+ test) | create | chain 4 route; test dựng app bằng `makeTestApiDeps` |
| `packages/api/src/routes/reading.ts` (phase 9) (+ test) | modify | thêm `GET /progress/:publicId`, `GET /history`, `DELETE /history/:publicId` |
| `packages/api/src/app.ts` | modify | mount `/library` |
| `apps/web/src/lib/reader/scroll.ts` (phase 9) (+ test) | modify | `pctToScrollY` |
| `apps/web/src/lib/reader/resume-handoff.ts` (+ test) | create | |
| `apps/web/src/lib/reader/use-reading-progress.ts` (phase 9) | modify | bỏ qua sự kiện cuộn do code khôi phục |
| `apps/web/src/lib/library.ts` | create | query key + `useShelf`, `useContinueReading`, mutation |
| `apps/web/src/components/library/library-button.tsx`, `continue-reading-button.tsx`, `library-item.tsx`, `history-list.tsx` | create | link tới trang công khai `reloadDocument` |
| `apps/web/src/routes/truyen.$storyKey.index.tsx` (phase 10) | modify | gắn 2 nút |
| route trang chương (phase 7) | modify | gọi `takeResumeHandoff` |
| `apps/web/src/routes/tu-truyen.tsx` | create | |
| `apps/web/src/components/site-layout.tsx` | modify | link "Tủ truyện" |
| `packages/shared/messages/vi.json` | modify | key `library_*`, `history_*`, `continue_*`, `shelf_*` |
| `apps/web/e2e/library.spec.ts` | create | |

## Implementation Steps

1. **Shared:** `SHELVES` đúng thứ tự enum DB (`libraryShelf.enumValues`); test đối chiếu.
2. **Core `library.ts`:**
   - `setShelf`: tra truyện qua `publicStoryWhere({ includeMature: true })`, không có → `err('NOT_FOUND')`;
   - `insert ... on conflict (user_id, story_id) do update set shelf = excluded.shelf` (không đụng `added_at`);
   - `removeFromLibrary`, `getShelf`;
   - `listLibrary`: join `storyCardColumns` + left join `reading_progress` + `chapters` (lấy `number`), lọc truyện công khai, `order by added_at desc`, offset 20.
3. **Core `continue.ts`:** `resolveReadableChapter` (dùng điều kiện `canReadChapter` phase 7); `getContinueReading`: chương còn đọc được → giữ nguyên `scrollPct`; không → chương đọc được lớn nhất ≤ số cũ, không có thì nhỏ nhất, `scrollPct = 0`; truyện không công khai → `null`.
4. **Core `history.ts`:** `listHistory` keyset như Architecture, `limit + 1` để biết còn trang; `chapterNumber` qua `resolveReadableChapter`; `removeFromHistory`.
5. **Int test core** (ma trận): upsert giữ `added_at`; lọc truyện ẩn/tác giả bị ban; chương xoá mềm → lùi chương; keyset không trùng/sót khi nhiều dòng cùng `updated_at`.
6. **API:**
   - `routes/library.ts` chain: `.get('/')`, `.get('/:publicId')`, `.put('/:publicId')`, `.delete('/:publicId')`;
   - mọi route `sessionMiddleware`, `requireAuth`, `validate()` (param `publicId` bằng `isValidPublicId` của shared, query/json bằng schema shared);
   - `routes/reading.ts` thêm 3 route; `Result` lỗi → `coreError()`. Không cần `requireVerifiedEmail` (không đăng nội dung).
7. **Web lib:** `pctToScrollY(el, pct)` = `el.offsetTop + (el.scrollHeight - innerHeight) * pct / 100` (cùng định nghĩa với `computeScrollPct`; unit test hai hàm ngược nhau); `resume-handoff.ts` (try/catch khi `sessionStorage` bị chặn).
8. **Nút trang truyện:**
   - `ContinueReadingButton` nhận `firstChapterNumber` từ loader; SSR render link tài liệu "Đọc từ đầu";
   - client có tiến độ → "Đọc tiếp chương N"; onClick ghi handoff rồi `location.assign(url)` (điều hướng tài liệu);
   - `LibraryButton`: `DropdownMenu` phase 1; optimistic update + rollback khi lỗi.
9. **Trang chương:** `useLayoutEffect` đọc handoff → `requestAnimationFrame` (+ `document.fonts.ready` tối đa 500 ms) → `scrollTo`, đặt sau khi `ChapterContent` có trong DOM; `useReadingProgress` (phase 9) bỏ qua sự kiện cuộn đầu tiên do code gây ra để không ghi đè `scrollPct` về 0.
10. **`/tu-truyen`:** `validateSearch({ ke: z.enum([...SHELVES, 'lich-su']).catch('reading') })`; tab là `Link` đổi `ke` (SPA, cùng trang cá nhân); `useQuery` cho kệ, `useInfiniteQuery` cho lịch sử; mục mở trang truyện/chương bằng `reloadDocument`; trạng thái rỗng có link về trang chủ; `headers: NO_STORE`, `noindex`.
11. **Header:** link "Tủ truyện" khi `useMe` có user (client).
12. **i18n:** `shelf_reading`, `shelf_plan`, `shelf_done`, `shelf_dropped`, `library_title`, `library_add`, `library_remove`, `library_move`, `library_empty`, `history_title`, `history_remove`, `history_load_more`, `history_empty`, `continue_reading`, `start_reading`, `library_sign_in`; `pnpm i18n:compile`.
13. **E2E `library.spec.ts`** (ma trận). Dữ liệu qua helper core; đăng nhập bằng UI hoặc `storageState` của helper sẵn có.
14. **Gate:** `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e`. Đánh `[x]` checkbox "Tủ truyện và lịch sử đọc, nút đọc tiếp." trong spec.

## Function / Interface Checklist

- [ ] `SHELVES`, `shelfSchema`, `libraryListQuery`, `historyCursorSchema`
- [ ] `setShelf`, `removeFromLibrary`, `getShelf`, `listLibrary`
- [ ] `listHistory`, `removeFromHistory`, `getContinueReading`, `resolveReadableChapter`
- [ ] `createLibraryRoutes(deps)`; 3 route mới trong `createReadingRoutes` (phase 9)
- [ ] `pctToScrollY`, `setResumeHandoff`, `takeResumeHandoff`
- [ ] `LibraryButton`, `ContinueReadingButton`, `LibraryItem`, `HistoryList`; route `/tu-truyen`

## Test Scenario Matrix

| Mức | Kịch bản | Loại |
|---|---|---|
| Critical | Thêm vào kệ Đang đọc → chuyển sang Đã xong → `added_at` không đổi, chỉ một dòng | int |
| Critical | Truyện bị ẩn / tác giả bị ban → biến khỏi tủ và lịch sử; dòng DB còn; bỏ ban → hiện lại | int |
| Critical | Tiến độ trỏ chương đã xoá mềm → "đọc tiếp" lùi về chương đọc được gần nhất, `scrollPct = 0` | int |
| Critical | Khách gọi mọi route `library`/`reading` → 401; không trả UUID | unit (api) |
| Critical | Đọc chương 2 cuộn ~50% → trang truyện hiện "Đọc tiếp chương 2" → bấm → trang chương (tải tài liệu, URL không query) mở ở khoảng 50% (± 10%) | e2e |
| High | `/tu-truyen`: thêm truyện từ trang truyện → thấy ở tab Đang đọc; đổi kệ → chuyển tab; bỏ khỏi tủ → biến mất | e2e |
| High | Lịch sử: 3 truyện theo thứ tự mới nhất; xoá một mục → còn 2 | e2e |
| High | Keyset: 45 dòng, 10 dòng trùng `updated_at` → duyệt hết 3 trang không trùng không sót | int |
| High | Trang truyện vẫn `cache-control: public`, không `set-cookie` sau khi thêm nút cá nhân hoá | e2e |
| Medium | `PUT /library/:publicId` truyện draft hoặc không tồn tại → 404 `{ error: { code: 'NOT_FOUND' } }` | unit (api) + int |
| Medium | `takeResumeHandoff` sai truyện/sai chương/quá 60s → `null` và vẫn xoá handoff | unit |
| Medium | `pctToScrollY(computeScrollPct(x)) ≈ x` | unit |
| Medium | Mở trực tiếp URL chương (không qua "Đọc tiếp") → bắt đầu từ đầu chương | e2e |

## Dependency Map

- **Cần:**
  - phase 1: `DropdownMenu`, `SiteLayout`;
  - phase 2: `validate()`, `coreError()`, `Result`, `makeTestApiDeps`, `isValidPublicId`;
  - phase 7: trang chương, `canReadChapter`, `MatureGate`, `canonicalPath`, quy tắc link tài liệu;
  - phase 9: `reading_progress` được ghi, `routes/reading.ts`, `computeScrollPct`, `useReadingProgress`;
  - phase 10: trang truyện, `StoryCardDto`/`storyCardColumns`, `publicStoryWhere`, `StoryCard`.
- **Phase sau dùng:**
  - phase 16: `noindex` cho `/tu-truyen` (đã đặt);
  - Giai đoạn 2: `reading_progress` là nguồn tỷ lệ bỏ dở.

## Success Criteria

- [ ] Thêm/đổi kệ/bỏ khỏi tủ chạy ở trang truyện và `/tu-truyen`
- [ ] Lịch sử đọc mới nhất trước, có xoá mục và tải thêm
- [ ] "Đọc tiếp" mở đúng chương và khôi phục vị trí cuộn, URL chương không có query
- [ ] Trang truyện vẫn cache công khai, không cookie
- [ ] Gate 5 lệnh xanh; checkbox spec = `[x]`

## Risk Assessment

| Rủi ro | Khả năng × Ảnh hưởng | Giảm thiểu |
|---|---|---|
| `scrollRestoration` của router ghi đè vị trí khôi phục | Trung bình × Trung bình | Cuộn sau layout + rAF; e2e kiểm vị trí |
| Ghi tiến độ về 0 ngay khi mở chương trước khi cuộn tới vị trí | Trung bình × Trung bình | Bỏ qua sự kiện cuộn do code; debounce của phase 9 |
| Chiều cao nội dung đổi sau khi font tải → lệch vị trí | Trung bình × Thấp | Chờ `document.fonts.ready` (tối đa 500 ms) |
| Nháy nút "Đọc từ đầu" → "Đọc tiếp" | Cao × Thấp | Chấp nhận (trang cache công khai); giữ cùng kích thước nút |
| Truyện ẩn biến mất khỏi tủ làm người đọc khó hiểu | Thấp × Thấp | Chấp nhận ở giai đoạn 1; câu hỏi mở 2 |

Rollback: không migration; gỡ route `library`, 3 route mới của `reading`, trang `/tu-truyen` và 2 nút là về trạng thái phase 11.

## Security Considerations

- Mọi route lọc theo `userId` của phiên; không có tham số user từ client nên không đọc được tủ/lịch sử người khác (IDOR).
- Route ghi (`PUT`/`DELETE`) đi qua CSRF `/api/v1`, `no-store`.
- `/tu-truyen` SSR không chứa dữ liệu cá nhân (tải ở client), `noindex`.
- Handoff ở `sessionStorage` chỉ chứa `publicId`, số chương, phần trăm.

## Câu hỏi mở (đã chốt — Validation Session 1, 2026-10-05)

1. Không tự thêm truyện vào kệ "Đang đọc".
2. Truyện trong tủ bị ẩn/gỡ: ẩn im lặng.

## Next Steps

Phase 13: rate limit Redis (đăng ký, đăng nhập, quên mật khẩu, tạo truyện, đăng chương, báo cáo, bình luận khai báo sẵn).
