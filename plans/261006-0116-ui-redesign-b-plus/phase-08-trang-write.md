---
phase: 8
title: "Trang write"
status: pending
priority: P1
effort: "0.5d"
dependencies: [7]
---

# Phase 8: Trang write

## Overview

Làm lại `/write` (Truyện của tôi): dải `--band` có 3 số liệu (truyện, chương đã đăng, chữ) + nút "Tạo truyện mới", lưới thẻ ngang (desktop 2 cột, mobile 1 cột), trạng thái rỗng có CTA duy nhất, restyle `WriterGate` (chưa đăng nhập, chưa xác thực). Số liệu cộng ở client từ `useMyStories`, không API mới.

Nguồn: `plans/reports/design-261006-write-editor-screens-report.md` mục "/write"; brainstorm §6.4, §8 (khu viết); scout-03 mục P7; quyết định [auto] `/write` trong `plan.md`; red team #3, #6, #13.

## Requirements

- Khung trang: container `max-w-[1240px] px-4 md:px-8`; `h1` "Truyện của tôi" sans 28/800 đứng đầu trang (bỏ `font-serif` ở `routes/write/index.tsx:32`; ngoài `WriterGate`, để các trạng thái gate vẫn có h1). Điều chỉnh so với canvas: h1 nằm trên dải band thay vì trong dải, vì `WriterGate` render thông báo thay cho phần con.
- **Có truyện:** dải `bg-band rounded-[28px] p-6 md:p-8`: `dl` 3 số liệu có vạch ngăn (`divide-x divide-border`): số truyện, tổng `chapterCount`, tổng `wordCount` (`formatWordCount`); nút đặc `Button asChild` → `Link to="/write/stories/new"` "Tạo truyện mới" (pill, `lg`/44px mobile). Dưới là `ul`: `grid gap-4 lg:grid-cols-[repeat(auto-fill,minmax(520px,1fr))]` (mobile 1 cột, không tràn < 552px).
<!-- Updated: Red Team 2026-10-06 - một <a> mỗi thẻ, sans, badge dùng chung -->
- **Thẻ ngang** (`li relative`, nền `--card`, viền `--border`, bo 18, một DOM cho mọi viewport): `StoryCover` 112px (mobile 76px, `sizes` tương ứng, không bọc link); cột phải: `StoryVisibilityBadge` (thay badge `routes/write/index.tsx:79`; Đã đăng = soft, Nháp = muted, Bị ẩn = viền destructive); chấm `coverColorVar(mainTag.slug)` `aria-hidden` + tên tag chính; tên truyện 20px/800 sans (bỏ `font-serif` ở `:74`) là `Link` `/write/stories/$publicId` kéo phủ cả thẻ (`after:absolute after:inset-0`) — **link duy nhất của thẻ**; dòng "Tình trạng · N chương · N chữ" (`STORY_STATUS_LABELS` từ `story/story-labels.ts`, thay import `STATUS_LABELS` từ `story-form.tsx` ở `routes/write/index.tsx:8` để phase 11 xoá được bản trùng); "Sửa lần cuối {ngày}"; "Quản lý →" (`hidden md:inline`, `aria-hidden`) / chevron (`md:hidden`, `aria-hidden`).
- **Rỗng:** không dải số liệu, không nút ở dải; khối giữa trang: icon bút trong vòng `bg-primary-soft` 56px `aria-hidden`, `writer_empty`, CTA đặc "Tạo truyện mới" → đúng **một** link tên này.
- **WriterGate:** khách → khối `--card` bo 24, `writer_sign_in_required` + nút "Đăng nhập"; chưa xác thực → khối `bg-warning-soft text-warning-foreground` bo 20, `writer_verify_required`, nút "Gửi lại mail xác thực", dòng `role=status` sau khi gửi; không nút tạo truyện ở hai trạng thái này. Giữ nguyên logic gate.
- Không lọc theo trạng thái, không nút "Viết chương mới"/"Xem trang truyện" trên thẻ.
<!-- Updated: Red Team 2026-10-06 - cộng số liệu inline, không file/test riêng -->
- Cộng 3 số liệu **inline** trong `WriterStats` (`stories.length`, `reduce` `chapterCount`, `reduce` `wordCount`), không tạo `lib/write-summary.ts`. `chapterCount`/`wordCount` chỉ tính chương đã đăng chưa xoá (`packages/core/src/publishing/counters.ts:10-15`), nhãn "chương đã đăng" khớp dữ liệu.

## Architecture

```
WriterHomePage (route /write, SiteLayout, noindex)
 ├─ h1 writer_title
 └─ WriterGate ─▶ MyStories
        useMe() (tên tác giả cho bìa) + useMyStories() (toàn bộ, không phân trang, updatedAt desc)
        ├─ rỗng → WriterEmptyState (trong route)
        └─ có  → WriterStats({ stories }) (trong route, cộng inline) + ul > MyStoryCard × N (components/write/my-story-card.tsx)
```

## Related Code Files

- **Modify:** `apps/web/src/routes/write/index.tsx`, `apps/web/src/components/writer-gate.tsx`, `packages/shared/messages/vi.json`, `apps/web/e2e/mobile-navigation.spec.ts`
- **Create:** `components/write/my-story-card.tsx`
- **Delete:** không

## File inventory

| Path | Dòng | Việc |
| --- | --- | --- |
| `routes/write/index.tsx` | 96 (phase 2 đã bỏ export `VISIBILITY_LABELS`) | khung trang + `MyStories`, `WriterStats`, `WriterEmptyState` (ước tính ~140) |
| `components/write/my-story-card.tsx` | mới | thẻ ngang (chuyển thẻ inline hiện có ra, giữ hằng `dateFormat`) |
| `components/writer-gate.tsx` | 70 | chỉ class + bố cục khối |
| `lib/stories.ts` | 114 | không sửa (`useMyStories`) |
| `components/story-cover.tsx`, `components/status-badges.tsx`, `lib/cover-palette.ts`, `components/story/story-labels.ts` | — | dùng (phase 2) |

## Test scenario matrix

| Kịch bản | Loại | File test | Trạng thái |
| --- | --- | --- | --- |
| User chưa có truyện bấm link "Tạo truyện mới" (strict) → `/write/stories/new` | e2e | `stories.spec.ts:7` | giữ |
| `listitem` lọc theo tên có "Nháp" (một node), `img` "Bìa truyện {tên}", link tên | e2e | `stories.spec.ts` | giữ |
| Khách: "Đăng nhập để viết và quản lý truyện của bạn."; chưa xác thực: `/Cần xác thực email trước khi đăng truyện/` | e2e | `stories.spec.ts` | giữ |
| `/write` noindex | e2e | `seo.spec.ts` | giữ |
| menuitem "Viết truyện" → `/write` (360/390) | e2e | `header-mobile.spec.ts` | giữ |
| 360: user có 1 truyện vào `/write`: tab "Viết" `aria-current=page`, `dl` "Tổng quan truyện của bạn" hiện "1" truyện, không tràn ngang | e2e | `mobile-navigation.spec.ts` | mới |

Không unit test riêng cho phép cộng (3 phép cộng inline, e2e trên kiểm số hiển thị).

## Function/interface checklist

- [ ] `WriterStats({ stories }: { stories: readonly { chapterCount: number; wordCount: number }[] })` (trong route)
- [ ] `MyStoryCard({ story, authorName })` (story: `AuthorStoryView` từ `@novel-hub/core`, như route hiện tại)
- [ ] `WriterEmptyState()` (trong route)

## Dependency map

- **Cần từ trước:** P1 `--band`, `--primary-soft`, `--warning-*`; P2 `StoryCover` (gáy), `StoryVisibilityBadge`, `STORY_STATUS_LABELS`, `coverColorVar`, Button pill; P3 nav "Viết truyện" + tab "Viết" `aria-current`.
- **Phase sau dùng:** P9/P10 không phụ thuộc trực tiếp; P11 xoá `STATUS_LABELS` ở `story-form.tsx` (cần route này đã đổi import); P12 ghi ngoại lệ "dải số liệu nhỏ ở /write" vào spec §8.

## Implementation Steps

1. `components/write/my-story-card.tsx`: chuyển thẻ inline hiện có ra, bố cục ngang; giữ `dateFormat` hiện có (`dateStyle: 'medium'`, trang không cache công khai); `StoryVisibilityBadge`; `STORY_STATUS_LABELS`.
2. `routes/write/index.tsx`: `WriterStats` (`<dl aria-label={m.writer_stats_label()}>`, mỗi ô `<div><dt>{nhãn}</dt><dd>{số}</dd></div>`, số 28/800 hiển thị trên nhãn bằng `flex-col-reverse`, giữ thứ tự dt/dd hợp lệ; nút tạo), `WriterEmptyState`, ghép: rỗng → chỉ `WriterEmptyState`; có → `WriterStats` + `ul`. h1 sans. Bỏ import `STATUS_LABELS`.
3. `writer-gate.tsx`: restyle khối khách/chưa xác thực; giữ chuỗi và luồng `useMutation`.
4. `vi.json` + `pnpm i18n:compile`.
5. Thêm test 360 `/write` vào `mobile-navigation.spec.ts` (`signUpVerified` + `createStory`).
6. Gate.

## Accessible name phải giữ

Link "Truyện của tôi" (trang sửa truyện), link "Tạo truyện mới" (đúng một ở mọi viewport/trạng thái), nút "Tạo truyện" ở `/write/stories/new`, nút "Gửi lại mail xác thực", chữ "Đăng nhập để viết và quản lý truyện của bạn.", "Cần xác thực email trước khi đăng truyện…"; thẻ là `<li>`; trong thẻ: `img` "Bìa truyện {tên}", một link chứa tên, đúng một chữ "Nháp"/"Đã đăng"/"Bị ẩn"; nav "Viết truyện" `aria-current`.

## i18n

| Key | Giá trị | Ghi chú |
| --- | --- | --- |
| `writer_stats_label` | Tổng quan truyện của bạn | mới (aria-label `dl`) |
| `writer_stat_stories` | truyện | mới |
| `writer_stat_published_chapters` | chương đã đăng | mới |
| `writer_stat_words` | chữ | mới |
| `writer_manage` | Quản lý | mới |
| `writer_title`, `writer_new_story`, `writer_empty`, `writer_chapter_count`, `writer_updated_at`, `story_card_words`, `story_visibility_*`, `story_status_*` | — | đã có |

## Success Criteria

- [ ] Gate `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm test:int && pnpm test:e2e` xanh
- [ ] Không đổi `lib/stories.ts`, `packages/*` (trừ `messages/vi.json`)
- [ ] User chưa có truyện: DOM chỉ có một link "Tạo truyện mới"
- [ ] `rg -n 'font-serif|\bSTATUS_LABELS\b' apps/web/src/routes/write/index.tsx apps/web/src/components/write` rỗng (chỉ còn `STORY_STATUS_LABELS`)
- [ ] Mọi file ≤ 200 dòng

## Risk Assessment

| Rủi ro | K × T | Giảm thiểu |
| --- | --- | --- |
| Hai link "Tạo truyện mới" cùng hiện (strict) | M × H | rỗng không render dải; một nút trong dải cho mọi viewport |
| `minmax(520px)` tràn ngang mobile | M × M | chỉ áp từ `lg` |
| Nhãn "chữ" hiểu nhầm gồm cả nháp | M × L | `dl` aria-label + nhãn "chương đã đăng"; đúng dữ liệu `counters.ts` |
| Badge/nhãn tình trạng trùng chữ "Nháp" trong thẻ | L × M | nhãn tình trạng truyện là ongoing/completed/hiatus, không có "Nháp" |
| Route vượt 200 dòng khi giữ `WriterStats`/`WriterEmptyState` inline | L × L | ước tính ~140; nếu vượt, chuyển `WriterStats` sang `components/write/writer-stats.tsx` |

**Rollback:** revert route + `writer-gate.tsx`, xoá `components/write/*`.

## Ngoài phạm vi phase

Không vẽ lại `/write/stories/new`, `/write/stories/$publicId` (phase 11 chỉ áp token); không dashboard số liệu; không lọc trạng thái; không API số chương nháp; không xoá `STATUS_LABELS` ở `story-form.tsx` (phase 11).
