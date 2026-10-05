---
phase: 3
title: "Layout header footer thanh tab"
status: completed
priority: P1
effort: "0.75d"
dependencies: [2]
---

# Phase 3: Layout header footer thanh tab

## Overview

Làm lại khung trang chung: header desktop/mobile, footer, thanh tab dưới cho mobile; tách `site-layout.tsx` (207 dòng) thành các file nhỏ; thêm prop ẩn thanh tab (trang truyện ẩn ngay từ phase này). Thêm e2e mobile mới.

Nguồn: brainstorm §5, §8 (header/layout); scout-01 mục P3; research-02 Q3 (bỏ phần "activeProps tự gắn aria-current": dự án tự đặt `aria-current` thủ công, xem `routes/library.tsx:74`); red team #5, #13.

## Requirements

- **Header desktop (≥ md):** cao 76, nền `--background`, viền dưới `--border`, container `max-w-[1240px] px-8`. Logo: ô 34px `rounded-[10px] bg-primary`, chữ "N" `font-serif font-bold text-primary-foreground` **`aria-hidden`** + "Novel Hub" 19/800 sans (bỏ `font-serif` ở `site-layout.tsx:49`) → tên link logo vẫn là "Novel Hub", `href="/"`, `reloadDocument`. Ô tìm kiếm pill 46px `bg-card` viền `--border` (searchbox "Tìm kiếm", placeholder `layout_search_placeholder`, Enter → `/search?q=`). <!-- Updated: Red Team 2026-10-06 - pill desktop chỉ khi đăng nhập --> Nav pill 42px "Tủ truyện" (`/library`), "Viết truyện" (icon bút, `/write`), `aria-current="page"` khi đang ở khu đó: **chỉ khi đã đăng nhập**, như hiện tại (`site-layout.tsx:122-130`). Nút tài khoản tròn 42px hiện chữ cái đầu tên (`aria-hidden`) + sr-only "Tài khoản: {tên}"; menu như hiện tại. Khách: link "Đăng nhập", "Đăng ký". Bỏ nút settings `lg:inline-flex` riêng (Cài đặt vẫn trong menu).
<!-- Updated: Red Team 2026-10-06 - header mobile < sm chỉ ô logo, ngân sách bề rộng 360 -->
- **Header mobile (< md):** logo | link icon "Tìm kiếm" (`href="/search"`, trong banner) | nút tài khoản hoặc "Đăng nhập"/"Đăng ký". Không ô tìm full-width. **Dưới `sm`: logo chỉ còn ô 34px, chữ "Novel Hub" `sr-only`** (tên link vẫn "Novel Hub"). Ngân sách khách ở 360 (đo bằng font thật, red team): padding 16+16, ô logo 34, gap 8, icon tìm 44, gap 8, "Đăng nhập" ~102 (70 chữ + 32 padding), gap 4, "Đăng ký" ~85 → ~317px ≤ 360. Nếu vẫn tràn: link khách `< md` dùng `size="sm"`. Không tràn ngang 360px kể cả tên hiển thị dài. Hiện trạng header khách 360 chỉ còn ~4px dư; bản cũ của plan (logo đủ chữ + icon 44) ~388px → tràn.
<!-- Updated: Red Team 2026-10-06 - thanh tab dùng Link TanStack cho đích cá nhân -->
- **Thanh tab (< md):** `nav aria-label="Điều hướng chính"`, **ngoài** `<header>`, `fixed inset-x-0 bottom-0 z-30 md:hidden`, cao 72 + `env(safe-area-inset-bottom)`, nền `--card`, viền trên. 5 mục, cùng kiểu điều hướng với lối vào cùng đích đang có trong header:
  - Trang chủ: `<Link to="/" reloadDocument>` (như logo, `site-layout.tsx:49`).
  - Khám phá: `<a href="/search">` (như icon tìm kiếm header, `site-layout.tsx:86`).
  - Tủ truyện: `<Link to="/library" search={{ shelf: 'reading', page: 1 }}>` (như `site-layout.tsx:123,157`).
  - Viết: `<Link to="/write">`.
  - Tôi: `<Link to="/settings">` nếu `useMe()` có user, `<Link to="/sign-in">` nếu khách hoặc chưa biết (ternary inline trong `mobile-tab-bar.tsx`, không hàm riêng).
  Lý do: `/library`, `/settings` trả `NO_STORE` (`routes/library.tsx:33`, `routes/settings.tsx:28`), `/write` là trang cá nhân → `<a>` thường sẽ boot lại app, mất cache React Query; header đi tới cùng đích bằng `Link`. Tab đang chọn: `aria-current="page"`, icon trong pill 52×28 `bg-primary-soft`, chữ `text-primary` 11/700; tab khác `text-muted-foreground` 11/500. `grid grid-cols-5` (5 × 72 = 360, vừa khít).
- Tab active tính bằng hàm thuần theo `pathname`: `/` exact → home; `/search*` → explore; `/library*` → library; `/write*` → write; `/settings*`, `/sign-in*` → me; còn lại không tab nào.
- **SiteLayout** prop `bottomInset?: 'tabBar' | 'cta' | 'none'` (mặc định `'tabBar'`). <!-- Updated: Validation 2026-10-06 - định nghĩa bottomInset ngay phase 3, bỏ đổi tên prop ở phase 5 --> `'tabBar'` = render `MobileTabBar` + khung (không phải `main`, vì footer nằm sau `main`) chừa `pb-[calc(72px+env(safe-area-inset-bottom))] md:pb-0`; `'cta'` = không thanh tab, giữ cùng padding (chỗ cho CTA dính đáy phase 5); `'none'` = không gì. Trang truyện (`routes/stories.$storyKey.index.tsx`) truyền `bottomInset="cta"` ngay phase này. Trang đọc, editor không dùng `SiteLayout` nên tự không có thanh tab.
<!-- Updated: Validation Session 2 - năm footer giữ động -->
- **Footer:** container 1240, 13px muted: "© {năm} Novel Hub" (giữ `{year}` tính động + `suppressHydrationWarning` như code hiện tại, không hardcode 2026) | `nav aria-label="Thông tin"`: "Điều khoản" `/terms`, "Quy định nội dung".
- SSR giống nhau cho mọi người: header/tab "Tôi" render bản khách ở SSR, đổi sau `useMe()` như `AccountMenu` hiện tại; `aria-current` chỉ theo path.
- Giữ menu tài khoản song song tab "Tôi".

## Architecture

```
SiteLayout({ children, bottomInset = 'tabBar' })
 ├─ SiteHeader            (components/site-header.tsx)  ── HeaderSearch, HeaderNav (chỉ khi đăng nhập), SiteAccountMenu
 ├─ <main>{children}</main>
 ├─ SiteFooter            (components/site-footer.tsx)
 └─ bottomInset === 'tabBar' && MobileTabBar (components/mobile-tab-bar.tsx) ── activeMainTab(pathname) (lib/main-nav.ts)
pathname: useRouterState({ select: (s) => s.location.pathname }) — cùng giá trị ở server và client
          (hook TanStack Router, repo chưa dùng chỗ nào; `useLocation()` tương đương)
```

## Related Code Files

- **Modify:** `apps/web/src/components/site-layout.tsx`, `apps/web/src/routes/stories.$storyKey.index.tsx` (chỉ prop `bottomInset="cta"`), `packages/shared/messages/vi.json`
- **Create:** `components/site-header.tsx`, `components/site-account-menu.tsx`, `components/site-footer.tsx`, `components/mobile-tab-bar.tsx`, `lib/main-nav.ts`, `lib/main-nav.test.ts`, `apps/web/e2e/mobile-navigation.spec.ts`
- **Delete:** không

## File inventory

| Path | Dòng | Việc |
| --- | --- | --- |
| `components/site-layout.tsx` | 207 | còn shell `SiteLayout` (~30 dòng) + prop `bottomInset` |
| `components/site-header.tsx` | mới | `SiteHeader`, `HeaderSearch`, nav desktop, logo (wordmark `sr-only` < sm) |
| `components/site-account-menu.tsx` | mới | `SiteAccountMenu` (nút tròn + dropdown, placeholder SSR `size-[42px] rounded-full`) |
| `components/site-footer.tsx` | mới | `SiteFooter` |
| `components/mobile-tab-bar.tsx` | mới | `MobileTabBar` (`Link`/`<a>` theo đích, href "Tôi" inline) |
| `lib/main-nav.ts` (+ test) | mới | `MAIN_TABS`, `activeMainTab()` |
| `routes/stories.$storyKey.index.tsx` | 169 | `<SiteLayout bottomInset="cta">` |
| `e2e/mobile-navigation.spec.ts` | mới | thanh tab |
| `e2e/header-mobile.spec.ts` | 101 | giữ (thêm trang truyện vào vòng lặp không tràn ngang nếu vòng lặp có sẵn nhận danh sách URL) |
| `e2e/layout.spec.ts` | 57 | giữ |

## Test scenario matrix

<!-- Updated: Red Team 2026-10-06 - bỏ e2e không thể fail (reader/editor không dùng SiteLayout), bỏ test meTabHref -->
| Kịch bản | Loại | File test | Trạng thái |
| --- | --- | --- | --- |
| `activeMainTab`: `/`→home, `/search?q=x`→explore, `/library`→library, `/write/stories/abc`→write, `/settings`/`/sign-in`→me, `/stories/x`→null, `/tags/x`→null | unit | `lib/main-nav.test.ts` | mới |
| 360: `/` có nav "Điều hướng chính" với 5 link, "Trang chủ" `aria-current=page` | e2e | `mobile-navigation.spec.ts` | mới |
| 360: `/search` → "Khám phá" `aria-current=page`; khách: "Tôi" href `/sign-in` | e2e | `mobile-navigation.spec.ts` | mới |
| 360: user đã đăng nhập (`signUpVerified`) bấm tab "Tủ truyện" → `/library` không tải lại tài liệu (một marker `window.__nav = 1` đặt trước vẫn còn sau điều hướng) | e2e | `mobile-navigation.spec.ts` | mới |
| 360: trang truyện không có nav "Điều hướng chính" hiển thị, không tràn ngang | e2e | `mobile-navigation.spec.ts` | mới |
| 1280: nav "Điều hướng chính" ẩn | e2e | `mobile-navigation.spec.ts` (describe riêng `test.use` 1280×720) | mới |
| banner, contentinfo chứa "Novel Hub", link Đăng nhập/Đăng ký trong banner, 404 | e2e | `layout.spec.ts` | giữ |
| 360/390/640/768: không tràn ngang (khách và tên dài), link "Tìm kiếm" `/search`, nút "Tài khoản: {LONG_NAME}", menuitem Viết truyện/Tủ truyện/Cài đặt/Đăng xuất; link "Novel Hub" vẫn có tên khi wordmark `sr-only` | e2e | `header-mobile.spec.ts` | giữ |
| searchbox "Tìm kiếm" Enter → `/search?q=` | e2e | `search.spec.ts:104` | giữ |
| menuitem "Tủ truyện" (desktop) | e2e | `library.spec.ts:103` | giữ |

Ghi chú: `/` và trang chương ở 360/390 đã được `header-mobile.spec.ts:37-57` kiểm không tràn ngang; trang đọc, editor không import `SiteLayout` (`routes/stories.$storyKey.chapter-{$number}.tsx:9,63` chỉ `NotFoundPage`) nên không viết e2e "không có thanh tab" cho chúng.

## Function/interface checklist

- [x] `SiteLayout({ children, bottomInset?: 'tabBar' | 'cta' | 'none' })`
- [x] `SiteHeader()`, `SiteAccountMenu()`, `SiteFooter()`, `MobileTabBar()`
- [x] `type MainTab = 'home' | 'explore' | 'library' | 'write' | 'me'`
- [x] `activeMainTab(pathname: string): MainTab | null`

## Dependency map

- **Cần từ P1–P2:** `bg-card`, `bg-primary-soft`, `font-serif` = Source Serif (ô logo), Button pill, DropdownMenu mới.
- **Phase sau dùng:** P4–P11 dùng `SiteLayout` mới; P5 thêm CTA dính đáy vào chỗ `bottomInset="cta"` đã chừa; P8 dựa `aria-current` nav "Viết truyện"; P11 dùng khung container 1240.

## Implementation Steps

1. Tạo `lib/main-nav.ts` + test (Vitest node).
2. Tách `site-layout.tsx`: chuyển nguyên `SiteHeader`/`HeaderSearch` sang `site-header.tsx`, `AccountMenu` sang `site-account-menu.tsx` (đổi tên `SiteAccountMenu`), `SiteFooter` sang `site-footer.tsx`. Chạy `pnpm typecheck && pnpm test:e2e -- layout header-mobile` để xác nhận tách không đổi hành vi.
3. Restyle header theo Requirements: container `mx-auto flex h-[60px] md:h-[76px] max-w-[1240px] items-center gap-2 px-4 md:gap-4 md:px-8`; wordmark `sr-only sm:not-sr-only`; ô tìm `hidden md:flex`, link icon tìm `md:hidden`; nav "Tủ truyện"/"Viết truyện" `hidden md:flex`, chỉ render khi đăng nhập, `aria-current` từ `activeMainTab`. Chạy ngay `pnpm test:e2e -- header-mobile`.
4. `SiteAccountMenu`: trigger `Button variant="secondary" size="icon"` tròn 42px, nội dung `<span aria-hidden>{initial}</span><span className="sr-only">{m.layout_account_menu()}: {displayName}</span>` — giữ đúng chuỗi tên hiện tại (kiểm tại code cũ dấu cách/hai chấm). Chữ cái đầu: ký tự đầu `displayName` viết hoa (`Array.from(name)[0]`, an toàn với ký tự ghép).
5. `MobileTabBar`: icon `HomeIcon`, `CompassIcon`, `LibraryBigIcon`, `PenLineIcon`, `UserRoundIcon` (lucide, `aria-hidden`), nhãn qua i18n; đích và kiểu link như Requirements; `useMe()` cho tab "Tôi".
6. `SiteLayout` nhận `bottomInset`; trang truyện truyền `"cta"`.
7. Footer restyle.
8. `vi.json` thêm key, `pnpm i18n:compile`.
9. `e2e/mobile-navigation.spec.ts`: `test.use({ viewport: { width: 360, height: 800 } })`; dùng `createPublishedStory`, `gotoHydrated`, `signUpVerified` từ `e2e/helpers`; helper `expectNoHorizontalScroll` viết cục bộ (giống `header-mobile.spec.ts:20`). Tìm nav bằng `page.getByRole('navigation', { name: 'Điều hướng chính' })`.
10. Gate.

## Accessible name phải giữ

`banner`, `contentinfo` (chứa "Novel Hub"); link "Đăng nhập", "Đăng ký" trong banner; link "Tìm kiếm" `href=/search` (mobile, trong banner); searchbox "Tìm kiếm" (desktop); nút "Tài khoản: {tên hiển thị}" (đúng chuỗi, tên dài 360px không tràn); menuitem "Viết truyện", "Tủ truyện", "Cài đặt", "Kiểm duyệt", "Đăng xuất"; footer link "Điều khoản" `/terms`, "Quy định nội dung", `nav "Thông tin"`; 404 heading "Không tìm thấy trang" + link "Về trang chủ"; link logo "Novel Hub" (kể cả khi chữ `sr-only`).

## i18n

| Key | Giá trị | Ghi chú |
| --- | --- | --- |
| `layout_main_nav` | Điều hướng chính | mới, aria-label thanh tab |
| `nav_explore` | Khám phá | mới |
| `nav_write` | Viết | mới (khác `layout_write` "Viết truyện") |
| `nav_me` | Tôi | mới |
| `nav_home` | Trang chủ | đã có (dòng 53) |
| `layout_library` | Tủ truyện | đã có |

## Success Criteria

- [x] Gate `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm test:int && pnpm test:e2e` xanh
- [x] `site-layout.tsx` và mọi file mới ≤ 200 dòng
- [x] HTML SSR `/` không chứa tên người dùng, không `Set-Cookie` (catalog/layout e2e giữ xanh)
- [x] Thanh tab không có trong `<header>`; không hiện ở ≥ md, trang truyện; tab "Tủ truyện"/"Viết"/"Tôi" là `Link` (không `<a href>` thường)
- [x] `header-mobile.spec.ts` khách 360 không tràn ngang
- [x] Không e2e cũ nào phải đổi

## Risk Assessment

| Rủi ro | K × T | Giảm thiểu |
| --- | --- | --- |
| Header khách 360 tràn ngang | M × H | wordmark `sr-only` < sm, ngân sách ~317px; dự phòng `size="sm"` cho link khách; chạy `header-mobile` ngay bước 3 |
| Link thanh tab trùng tên với link khác cùng hiện (strict mode) | L × M | e2e hiện có đều giới hạn trong `banner`; nav desktop `hidden md:flex`, tab bar `md:hidden` |
| Tab "Tôi" lệch hydrate | L × M | SSR + render đầu client cùng bản khách (`useMe` chưa có dữ liệu) |
| Thanh tab fixed che nội dung/footer | M × L | padding khung khi `bottomInset` ≠ `'none'`; e2e không tràn ngang |
| Trang truyện mobile chưa có CTA dính đáy tới phase 5 | H × L | chấp nhận (quyết định [auto]) |
| `useRouterState` trong trang lỗi/404 | L × M | `QueryClient` + router có ở shell (`__root.tsx`); nếu không lấy được pathname thì không tab nào active |

**Rollback:** revert 7 file; e2e mới xoá cùng.

## Ngoài phạm vi phase

Không đổi `auth-ui.tsx`, `not-found.tsx`, `static-page.tsx` (phase 11); không CTA trang truyện (phase 5); không đổi trang đọc/editor; không đổi `font-serif` ở file khác ngoài header.

## Kết quả thực hiện (2026-10-06)

- Gate xanh: typecheck, lint, format:check, unit 654, int 301, e2e 77 (thêm 5 e2e `mobile-navigation.spec.ts`, 14 unit `main-nav.test.ts`).
- Review: `reports/code-reviewer-261006-phase-03-layout-header-footer-thanh-tab-review-report.md` (chỉ Low).
- [auto] Pill "Tủ truyện"/"Viết truyện" desktop bọc `div`, không `nav`. Lý do: tránh landmark thứ hai trùng tên "Điều hướng chính" với thanh tab.
- [auto] Ô tìm giữ viền `border-input` của `Input` thay `--border`. Lý do: viền ô nhập cần tương phản 3:1.
- [auto] `header-mobile.spec.ts` không đổi (vòng lặp không nhận danh sách URL); trang truyện 360 được kiểm ở `mobile-navigation.spec.ts`. Lý do: đúng điều kiện trong file inventory.
- [auto] Hoãn `scroll-padding-bottom` và `viewport-fit=cover` (review Low 2, 3). Lý do: CSS/head toàn cục ngoài phạm vi phase; ghi cho phase 11.
