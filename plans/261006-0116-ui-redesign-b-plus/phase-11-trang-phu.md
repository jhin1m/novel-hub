---
phase: 11
title: "Trang phụ"
status: completed
priority: P2
effort: "1d"
dependencies: [10]
---

# Phase 11: Trang phụ

## Overview

<!-- Updated: Red Team 2026-10-06 - phase 11 chỉ còn trang phụ, tài liệu sang phase 12; tách cố định 4 file -->
Áp token + component + khung trang chuẩn cho các trang còn lại (không thiết kế lại bố cục): `/search`, `/tags/{slug}`, `/authors/{username}`, `/library`, `/settings`, các trang auth, `/moderation`, `/write/stories/new`, `/write/stories/$publicId`, `/terms`, `/content-policy`, 404, dialog báo cáo. Quét nốt `font-serif` tiêu đề UI và badge còn lại. Tách cố định 4 file > 200 dòng mà phase này sửa. Không sửa tài liệu (phase 12).

Nguồn: brainstorm §6.6, §8; scout-03 mục P9; quyết định [auto] `/search`, `/library`, trang phụ trong `plan.md`; red team #3, #6, #13, #15.

## Requirements

- **Khung trang chuẩn** (`components/page-shell.tsx`): `PageShell` = container `mx-auto w-full max-w-[1240px] px-4 py-8 md:px-8 md:py-10` (prop `width?: 'default' | 'narrow'` cho form ~ `max-w-[560px]`); `PageTitle` = `<h1>` sans 28/800 `tracking-tight` (`text-[28px] leading-tight font-extrabold`). Thay 13 `h1` lặp + container `max-w-sm/xl/2xl/3xl/5xl/6xl` ở các trang phụ. Khối form/nội dung chính trên thẻ `bg-card border rounded-3xl` (24).
<!-- Updated: Red Team 2026-10-06 - không SegmentedLinks; restyle tại chỗ, giữ Link typed -->
- **Tab dạng link (không component chung):** restyle **tại chỗ** `LibraryTabs` (`routes/library.tsx:65-89`) và `TabLinks` (`routes/moderation.tsx:99-142`, gồm `interface TabItem` ở 99–104) bằng class dùng chung trong `components/segmented-link-classes.ts`: `SEGMENTED_LIST_CLASS` (`inline-flex bg-secondary p-1 rounded-full`), `segmentedLinkClass(current: boolean, small?: boolean)` (pill; chọn `bg-card font-bold`; `small` = chip `flex-wrap` cho hàng lọc trạng thái/lý do ở `/moderation`). **Giữ** `<Link to="/library" search={{ shelf, page: 1 }}>` và `<Link to="/moderation" search={item.search}>` (search params có type, điều hướng client), giữ `aria-current="page"` thủ công, giữ nhánh `small` xuống dòng (hàng lý do nhiều mục không tràn 360). Lý do: `SegmentedLinks({ href })` mất type search params TanStack và đổi sang tải lại toàn trang ở trang `ssr:false`.
- `/search`: giữ `Select` lọc + nút "Tìm" (chỉ style từ phase 2); kết quả truyện dùng `StoryRowList` (một `<a>` mỗi thẻ, phase 2), tiêu đề mục `SectionHeading` với `id="search-stories"`/`"search-authors"` (region "Truyện"/"Tác giả" lấy tên từ h2); không chip lọc.
- `/tags/{slug}`: `PageTitle` tên tag + `Badge` kind; `StoryGrid`; `Pagination` pill (`components/story/pagination.tsx`, nút `rounded-full`, trang hiện tại `bg-primary text-primary-foreground`).
- `/authors/{username}`: khối tác giả (chữ cái đầu tròn 64px `bg-primary-soft text-primary` `aria-hidden`, tên h1, `@username`, bio nếu có) + `StoryGrid`; không hero màu.
- `/library`: tab kệ restyle tại chỗ; `library-item.tsx` (`StoryFlagBadges` thay `:50`, h3 sans thay `:32`), `history-list.tsx`, `shelf-menu.tsx` chỉ đổi class; **không** thanh tiến độ; không thêm `h3` nào khác vào `main`.
- `/settings`: 2 section trên thẻ `--card` bo 24, h2 sans 800 (không icon).
- Auth (`/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`): sửa `AuthPage` trong `components/auth-ui.tsx` → thẻ `--card` bo 24, rộng `max-w-[480px]`, giữa trang; `TextField`/`FormMessage` theo input/thông báo inline mới (lỗi: nền trong suốt chữ `--destructive`; thành công: `bg-primary-soft` + icon check). Một `alert` duy nhất cho lỗi đăng nhập.
- `/moderation`: `PageTitle` "Kiểm duyệt" (level 1), tab restyle; `report-card.tsx` đổi class + variant badge (báo cáo mở → `warning`). Giữ `<article>`, heading lý do, nút "Ẩn chương".
- `/write/stories/new`, `/write/stories/$publicId`: `PageShell` + thẻ form; `tag-picker.tsx` chip hoá bằng CSS trên label (`has-[[data-state=checked]]:bg-primary has-[[data-state=checked]]:text-primary-foreground`), giữ Radix `Checkbox` (`role=checkbox`, `disabled` khi đủ 10); `cover-upload.tsx` bo 12; `chapter-list.tsx` thẻ bo 18 + `ChapterStatusBadge` (thay `:87`).
- `static-page.tsx`: thân bài `font-serif` (Source Serif, văn bản đọc dài) 17/1.75, h1/h2 sans. `not-found.tsx`: `PageShell` + `PageTitle`.
- Dialog báo cáo (`components/report/*`): chỉ kiểm lại sau Dialog mới, sửa class nếu lệch. Màn 18+ đã xong ở phase 5.
<!-- Updated: Red Team 2026-10-06 - quét nốt font-serif và badge -->
- **Quét nốt `font-serif` tiêu đề UI và badge** theo bảng phân công ở phase 2 (dòng "11"): `chapter-list.tsx:54`, `not-found.tsx:19`, `cover-upload.tsx:53`, `auth-ui.tsx:14`, `search/search-results.tsx:51,74`, `static-page.tsx:15,23`, `library/library-item.tsx:32`, `routes/{moderation:60, library:44, authors.$username:57,69, search:40, tags.$tagSlug:68, settings:38,90,150}`, `routes/write/stories/$publicId/index.tsx:32`, `routes/write/stories/new.tsx:23` (grep lại khi cook; số dòng có thể đã dịch).
<!-- Updated: Red Team 2026-10-06 - tách cố định 4 file theo scout-03 -->
- **Tách cố định** (theo scout-03 mục P9.5, không điều kiện):
  1. `routes/settings.tsx` (207) → `components/settings/mature-setting.tsx` (`MatureSetting`, dòng 134–207).
  2. `routes/moderation.tsx` (203) → `components/moderation/moderation-tab-links.tsx` (`TabLinks` + `interface TabItem`, dòng 99–142) <!-- Updated: Validation Session 2 - TabItem ở 99-104 -->, restyle trong file mới.
  3. `components/moderation/report-card.tsx` (335) → `components/moderation/report-actions.ts` (`ACTION_LABELS`, `DistributiveOmit`, `CardAction`, `storyActions`, `userActions`, `canActOn`, `actionsFor`, type `Viewer` nếu khai báo ở đây; dòng 27–123) + `components/moderation/report-target-context.tsx` (`StoryLine`, `ChapterLine`, `UserStatusBadge`, `TargetContext`; dòng 125–227); `ReportCard` và `REPORT_STATUS_LABELS` ở lại; `ReportCard` import type `Viewer` (dòng 81) từ `report-actions.ts`. Viết `report-actions.test.ts` **trước** khi di chuyển (export tạm từ file cũ, test xanh, rồi di chuyển và chỉ đổi import của test).
  4. `components/story-form.tsx` (202) → xoá `STATUS_LABELS` trùng (dòng 37), Select tình trạng dùng `STORY_STATUS_LABELS` từ `story/story-labels.ts` (~196). Trước khi xoá: `rg -n '\bSTATUS_LABELS\b' apps/web/src` chỉ còn định nghĩa trong `story-form.tsx` (phase 8 đã đổi import ở `routes/write/index.tsx`).

## Architecture

```
PageShell(width) > PageTitle(h1) + nội dung   ← search, tags, authors, library, settings, moderation, write/new, write/$publicId, not-found
AuthPage(title) = SiteLayout > PageShell narrow > thẻ card  ← sign-in/up, forgot/reset
segmented-link-classes.ts ── LibraryTabs (routes/library.tsx, Link search shelf) · TabLinks (moderation-tab-links.tsx, Link search, small)
report-card.tsx ── report-actions.ts (thuần, có test) · report-target-context.tsx
routes/settings.tsx ── components/settings/mature-setting.tsx
```

## Related Code Files

- **Modify:** `routes/{search,tags.$tagSlug,authors.$username,library,settings,moderation}.tsx`, `routes/write/stories/new.tsx`, `routes/write/stories/$publicId/index.tsx`, `components/search/{search-form,search-results}.tsx`, `components/story/pagination.tsx`, `components/library/{library-item,history-list,shelf-menu}.tsx`, `components/auth-ui.tsx`, `components/moderation/{report-card,merge-tag-form,confirm-dialog}.tsx`, `components/{static-page,not-found,story-form,tag-picker,cover-upload,chapter-list}.tsx`, `components/report/*` (nếu lệch), `apps/web/e2e/mobile-navigation.spec.ts`
- **Create:** `components/page-shell.tsx`, `components/page-shell.test.tsx`, `components/segmented-link-classes.ts`, `components/settings/mature-setting.tsx`, `components/moderation/moderation-tab-links.tsx`, `components/moderation/report-actions.ts`, `components/moderation/report-actions.test.ts`, `components/moderation/report-target-context.tsx`
- **Delete:** không (`LibraryTabs` giữ trong route, `TabLinks` chuyển file)

## File inventory

| Path | Dòng | Việc |
| --- | --- | --- |
| `routes/search.tsx` / `search/search-form.tsx` / `search/search-results.tsx` | 52 / 161 / 94 | khung; style; `StoryRowList` + `SectionHeading` |
| `routes/tags.$tagSlug.tsx` / `story/pagination.tsx` | 84 / 43 | khung; pill |
| `routes/authors.$username.tsx` | 81 | khối tác giả |
| `routes/library.tsx` + `components/library/*` | 150 + 360 | tab restyle tại chỗ; class; badge |
| `routes/settings.tsx` | 207 | thẻ; tách `MatureSetting` → < 200 |
| `components/settings/mature-setting.tsx` | mới | `MatureSetting` (~75) |
| `components/auth-ui.tsx` | 70 | `AuthPage` thẻ |
| `routes/moderation.tsx` | 203 | `PageTitle`; tách `TabLinks` → < 200 |
| `components/moderation/moderation-tab-links.tsx` | mới | `TabLinks` restyle (~40) |
| `components/moderation/report-card.tsx` | 335 | class/variant; tách → < 200 |
| `components/moderation/report-actions.ts` (+ test) | mới | logic hành động thuần (~100) |
| `components/moderation/report-target-context.tsx` | mới | ngữ cảnh đích (~105) |
| `components/moderation/merge-tag-form.tsx` / `confirm-dialog.tsx` | 141 / 48 | class |
| `routes/write/stories/new.tsx` / `$publicId/index.tsx` | 56 / 85 | khung + thẻ |
| `components/story-form.tsx` / `tag-picker.tsx` / `cover-upload.tsx` / `chapter-list.tsx` | 202 / 133 / 139 / 171 | bỏ `STATUS_LABELS` (~196) / class / class / class + badge |
| `components/static-page.tsx` / `not-found.tsx` | 35 / 57 | thân serif; khung |
| `components/segmented-link-classes.ts` | mới | 2 export class |

## Test scenario matrix

| Kịch bản | Loại | File test | Trạng thái |
| --- | --- | --- | --- |
| `PageTitle` render `<h1>` level 1 | unit | `page-shell.test.tsx` | mới |
| `actionsFor`/`canActOn`/`storyActions`/`userActions` theo trạng thái báo cáo, vai trò người xem, chủ sở hữu (viết trước khi di chuyển, trên code hiện tại) | unit | `moderation/report-actions.test.ts` | mới |
| region "Truyện"/"Tác giả"; "2 truyện phù hợp"; label "Tình trạng" + option "Hoàn thành" + nút "Tìm" exact; searchbox "Từ khoá"; `region Truyện > status`; link tên truyện strict (một `<a>` mỗi thẻ) | e2e | `search.spec.ts` | giữ |
| h1 tên truyện; link "Tiên hiệp"; checkbox "Hiện nội dung 18+" + "Tôi xác nhận đã đủ 18 tuổi"; footer link | e2e | `catalog.spec.ts` | giữ |
| "Đọc tiếp chương N" ×3 lịch sử; menuitemradio "Đã xong"; **link** "Đã xong"; "Kệ này chưa có truyện nào."; menuitem "Bỏ khỏi tủ"; `main` h3 = tên truyện; "Xoá khỏi lịch sử"; noindex | e2e | `library.spec.ts` | giữ |
| dialog "Báo cáo chương", label "Đạo văn", "Mô tả thêm (không bắt buộc)", "Gửi báo cáo"; heading "Kiểm duyệt" level 1; `article` theo tên truyện; heading "Đạo văn"; nút "Ẩn chương" exact | e2e | `moderation.spec.ts` | giữ |
| label "Tên hiển thị"/"Tên người dùng"/"Email"/"Mật khẩu"; nút "Tạo tài khoản", "Đăng nhập" exact; một `alert` "Email hoặc mật khẩu không đúng."; settings: "Xin chào, {name}", "Gửi lại mail xác thực", "Đăng xuất", "Bạn chưa đăng nhập."; checkbox 18+ trong `MatureSetting` | e2e | `auth.spec.ts`, `catalog.spec.ts` | giữ |
| label "Tên truyện", "Giới thiệu"; combobox "Thể loại chính"; checkbox "Hệ thống", "Truyện có nội dung 18+"; "Đã chọn 2/10 tag"; label "Tình trạng" + option "Hoàn thành" (Select dùng `STORY_STATUS_LABELS`); nút "Tạo truyện", "Lưu thay đổi"; heading "Sửa truyện"; "Chưa có bìa"; lỗi validate | e2e | `stories.spec.ts` | giữ |
| noindex/canonical trang phụ; 404 | e2e | `seo.spec.ts`, `layout.spec.ts` | giữ |
| 360: `/search`, `/library`, `/sign-in`, `/moderation` (mod) không tràn ngang | e2e | `mobile-navigation.spec.ts` | mới |

## Function/interface checklist

- [x] `PageShell({ children, width?: 'default' | 'narrow', className? })`, `PageTitle({ children })`
- [x] `SEGMENTED_LIST_CLASS: string`, `segmentedLinkClass(current: boolean, small?: boolean): string`
- [x] `MatureSetting({ user }: { user: MeUser })` (chữ ký hiện tại)
- [x] `TabLinks({ label, items, small }: { label: string; items: TabItem[]; small?: boolean })` (chữ ký hiện tại, export)
- [x] `report-actions.ts`: export `CardAction`, `storyActions`, `userActions`, `canActOn`, `actionsFor`, `ACTION_LABELS` (chữ ký hiện tại)
- [x] `report-target-context.tsx`: export `TargetContext({ report })` (+ `StoryLine`, `ChapterLine`, `UserStatusBadge` nội bộ)

## Dependency map

- **Cần từ trước:** P1 token; P2 Button/Badge/Input/Select/Dialog, `StoryRowList`, `SectionHeading`, status badges, bảng phân công `font-serif`; P3 `SiteLayout`; P4 `StoryRowList` dùng thật; P5 `mature-gate` restyle; P8 đã đổi import `STATUS_LABELS` ở `/write`.
- **Phase sau dùng:** P12 ghi tài liệu (component, `PageShell`, class tab, khung trang).

## Implementation Steps

1. `report-actions.test.ts` trên code hiện tại (export tạm các hàm từ `report-card.tsx`) → xanh; rồi di chuyển sang `report-actions.ts`, `report-target-context.tsx`; chạy test + `moderation.spec`.
2. Tách `MatureSetting` sang `components/settings/mature-setting.tsx`; `TabLinks` sang `components/moderation/moderation-tab-links.tsx`; xoá `STATUS_LABELS` ở `story-form.tsx`. `pnpm typecheck`, chạy `auth`, `catalog`, `moderation`, `stories` spec.
3. `page-shell.tsx` + test; `segmented-link-classes.ts`.
4. `/library`, `/moderation` restyle tab tại chỗ (giữ `Link to/search`, `aria-current`, `small`); chạy `library.spec`, `moderation.spec`.
5. `/search` (form style, results `StoryRowList` + `SectionHeading`), `/tags`, `pagination.tsx`, `/authors`.
6. `auth-ui.tsx` (`AuthPage`), `/settings`.
7. `report-card.tsx` + moderation components: class/variant.
8. `/write/stories/new`, `/write/stories/$publicId`, `story-form.tsx`, `tag-picker.tsx`, `cover-upload.tsx`, `chapter-list.tsx`.
9. `static-page.tsx`, `not-found.tsx`; kiểm `components/report/*` sau Dialog mới.
10. Quét `font-serif` + `rg -n 'max-w-(sm|xl|2xl|3xl|5xl|6xl)' apps/web/src/routes` → các trang phụ đã qua `PageShell`.
11. e2e 360 mới trong `mobile-navigation.spec.ts`.
12. Gate.

## Accessible name phải giữ

Xem ma trận test; thêm: region "Truyện", "Tác giả"; searchbox "Từ khoá"; heading "Kiểm duyệt" level 1; link "Đã xong" (tab vẫn là link); heading level 3 trong `main` của lịch sử chỉ là tên truyện; `role=checkbox` ở tag picker; heading "Không tìm thấy trang" + link "Về trang chủ"; footer "Điều khoản", "Quy định nội dung"; nút "Ẩn chương" exact; `article` thẻ báo cáo.

## i18n

Không key mới (không thanh tiến độ tủ truyện, không chip lọc, tab giữ aria-label hiện có).

## Success Criteria

- [x] Gate `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm test:int && pnpm test:e2e` xanh
- [x] `routes/settings.tsx`, `routes/moderation.tsx`, `components/moderation/report-card.tsx`, `components/story-form.tsx` và mọi file mới ≤ 200 dòng
<!-- Updated: Red Team 2026-10-06 - tiêu chí font-serif theo danh sách file nội dung, loại app.css -->
- [x] `rg -l 'font-serif' apps/web/src --glob '*.tsx'` chỉ còn file chứa **nội dung truyện/văn bản đọc** hoặc dấu thương hiệu: `components/story/story-synopsis.tsx` (giới thiệu), `components/reader/chapter-header.tsx` (h1 chương), `components/reader/chapter-end.tsx` (thân lời nhắn), `components/reader/reader-settings-controls.tsx` (ô "Aa"), `components/editor/chapter-editor.tsx` (nội dung), `components/editor/chapter-meta-field.tsx` (ô tên chương), file xem trước revision (`revision-history-sheet.tsx` hoặc `revision-preview.tsx`), `components/static-page.tsx` (thân bài), `components/site-header.tsx` (ô chữ "N" `aria-hidden`). Không tính `styles/app.css` (comment + `--font-serif`). Mỗi hit còn lại phải là phần tử nội dung, không phải h1/h2/h3/nhãn UI
- [x] `rg -n "status === 'published' \? 'default'" apps/web/src` rỗng (mẫu badge lặp cũ ở 2 nơi: `chapter-editor.tsx:390`, `chapter-list.tsx:87`; đã thay bằng `status-badges.tsx`, scout-03 mục P7.5)
- [x] `rg -n '\bSTATUS_LABELS\b|SegmentedLinks' apps/web/src` rỗng
- [x] Không file nào trong `packages/` (trừ `messages/vi.json` nếu cần) đổi; không route/URL/head đổi

## Risk Assessment

| Rủi ro | K × T | Giảm thiểu |
| --- | --- | --- |
| Restyle tab làm mất `aria-current`/query/type | M × M | giữ `Link to/search` và logic `current`; `library.spec`, `moderation.spec` sau bước 4 |
| Tách `report-card.tsx` làm hỏng hành động mod | L × H | test `report-actions` viết trước trên code cũ; `moderation.spec` |
| Hàng lý do `/moderation` tràn ngang 360 | M × M | nhánh `small` wrap; e2e 360 |
| Thêm `h3` vào `main` `/library` vỡ `library.spec:135` | L × M | không thêm tiêu đề cấp 3 |
| Thêm `alert` thứ hai ở form đăng nhập | L × M | `FormMessage` giữ một node |
| Phase rộng (8 route, ~20 component, 4 tách) | M × M | tách làm đầu (bước 1–2) và chạy spec liên quan ngay; phần còn lại chỉ class |

**Rollback:** revert theo nhóm trang; tách file revert riêng (mỗi nhóm một commit checkpoint nếu controller muốn).

## Ngoài phạm vi phase

Không thiết kế lại bố cục trang phụ, không chip lọc `/search`, không thanh tiến độ `/library`, không hero trang tác giả, không vẽ trang quản lý truyện, không component tab dùng chung, không sửa `docs/` (phase 12), không đánh `[x]` spec.

## Cook Log (2026-10-06, auto)

- [auto] Không import được `report-card.tsx` trong unit test (alias `@/` không resolve ở vitest gốc, chuỗi phụ thuộc sâu) → chuyển nguyên văn dòng 27–123 sang `report-actions.ts` rồi chạy test trên đó. Lý do: code không đổi một ký tự logic, tương đương test trên code cũ; reviewer đối chiếu từng dòng với HEAD.
- [auto] `/moderation` dùng `PageShell` mặc định 1240. Lý do: đúng plan; reviewer gợi ý cap ~960 để sáng user quyết.
- [auto] Form truyện (`/write/stories/new`, `$publicId`) và trang tĩnh dùng cột 720 (`narrow` + `max-w-[720px]`). Lý do: form có textarea giới thiệu, danh sách chương; cũ là 672.
- [auto] Pagination: trang hiện tại là pill `bg-primary` chứa "Trang x/y", nút trước/sau giữ cỡ 44px. Lý do: không thêm i18n, giữ vùng chạm.
- [auto] `TabLinks` import `type ModerationSearch` từ route. Lý do: chỉ type, xoá khi build; dời sang `lib/` là refactor ngoài phạm vi.
- Sau review: chip tag có focus ring offset trên chính chip, bỏ mờ chồng khi disabled, không hover khi disabled/đã chọn; `pageCardClass` dùng `rounded-xl` (24, trong thang radius).
