---
phase: 2
title: "Header và footer"
status: pending
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: Header và footer

**Status:** pending

## Bối cảnh chung

- Repo `/Users/jhin1m/Desktop/ducanh-project/novel-hub`, nhánh `redesign/261109`. Không đổi nhánh, không push, không deploy, không đụng `dcn-prod`. Worker không commit; phiên điều phối chạy gate, đổi Status, đánh checkbox spec, commit.
- Trong code mọi thứ tiếng Anh; chuỗi hiển thị qua `packages/shared/messages/vi.json`, rồi `pnpm i18n:compile`. Không ghi số phase, tên plan trong code hay tên test.
- HTML công khai giống nhau cho mọi người, không đọc session khi SSR. Không gradient, không nền tím, không serif hay chữ nghiêng ở giao diện, không chơi chữ "Say" (giữ tên SayNovel).
- Brief: `plans/reports/brief-261109-1347-redesign-design-chot-report.md` mục 6. Board: `design-boards/Main.dc.html` dòng 22-43 và 168-183, `design-boards/Mobile.dc.html` dòng 21-27.
- Gate: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e`. Đỏ sau 2 lần sửa thì dừng, hỏi user.

## Overview

Header theo board: logo mới, nav chữ cho mọi người, khách có Đăng nhập/Đăng ký. Footer theo board: dòng thương hiệu, liên kết, công tắc giao diện 3 nấc.

## Requirements

**Logo:** SVG 36×36: nền bo 9 màu `--primary`, gáy `x0 y0 w7 h36 rx3` đen 22%, dấu trang `M24 2 v13 l-3.5 -2.6 L17 15 V2 Z` màu `--cover-fg`. Chữ 25px, tracking -0.02em, "Say" 700 màu `--primary`, "Novel" 500. Mobile 32px và 23px, luôn hiện chữ. Tên truy cập của link vẫn là `m.app_name()`. Thay ô chữ "S" serif.

**Header từ `md`:** ô tìm kiếm pill cao 44, `max-w-[420px]`. Nav cho mọi người: Khám phá, Bảng xếp hạng, Tủ truyện. Đã đăng nhập có thêm Viết truyện, chuông, ô chữ cái. Khách có link "Đăng nhập" (600) và pill "Đăng ký" cao 44 nền `--primary`.

**Header dưới `md`:** logo, icon tìm kiếm. Khách giữ nút tròn 42px mở menu Đăng nhập/Đăng ký (lệch board có chủ đích: trang truyện không có thanh tab). Đã đăng nhập giữ chuông và ô chữ cái.

**Chống xô layout:** khi `useMe()` đang tải, dưới `md` giữ nguyên ô 42px hiện có (icon `.guest-hint`, chữ cái `.signed-in-hint`). Từ `md`: link khách là `.guest-hint`, nằm ngoài khối `aria-hidden`; ô chữ cái là `.signed-in-hint`. Boot script ẩn dạng sai trước khi vẽ.

**Footer:** `SayNovel · Truyện chữ sáng tác gốc tiếng Việt`, các link hiện có (Bảng xếp hạng, Điều khoản, Quy định nội dung, Chính sách bảo mật; Cuộc thi vẫn sau `CONTESTS_ENABLED`), bộ chọn Theo hệ thống / Ngà / Tối bằng `ChoiceGroup variant="segment"` có sẵn, nhãn "Giao diện" `sr-only`. Bỏ dòng ©. Render cho mọi người để HTML không phụ thuộc session; thành viên vẫn có mục theme trong menu tài khoản.

## Key Insights

- `useSiteTheme()` đã an toàn cho SSR (server snapshot luôn là mặc định), boot script đã vẽ đúng theme nên chỉ `aria-pressed` đổi sau hydrate, không xô layout.
- `SignInPromptLink` đưa khách về lại trang đang ở và render link thật trước hydrate; dùng cho "Đăng nhập". "Đăng ký" dùng `<Link to="/sign-up">` như `GuestAccountMenu`.
- Nav hiện icon-only ở 768-1023: `e2e/layout.spec.ts` kiểm tên link ở 768px, vẫn đạt nhờ `sr-only`. Board không có icon ở 1440: chữ không icon từ `xl`, dưới đó giữ icon với nhãn `sr-only`.

## Related Code Files

| File | Việc | Test bị ảnh hưởng |
|------|------|--------------------|
| `apps/web/src/components/site-logo.tsx` | Tạo: SVG mark và wordmark | |
| `apps/web/src/components/site-header.tsx` | Logo, nav chung, tách link Tủ truyện khỏi `HeaderNav` | `e2e/layout.spec.ts`, `e2e/header-mobile.spec.ts`, `e2e/rankings.spec.ts:140` |
| `apps/web/src/components/site-account-menu.tsx` | `GuestAccountMenu` chỉ dưới `md`, thêm link khách từ `md`, placeholder hai dạng | `e2e/layout.spec.ts:11-14`, `e2e/layout-polish.spec.ts:72-99` |
| `apps/web/src/components/site-footer.tsx` | Bố cục mới, công tắc giao diện | `e2e/layout.spec.ts:10`, `e2e/mobile-navigation.spec.ts:124` |
| `packages/shared/messages/vi.json` | `layout_logo_first` "Say", `layout_logo_second` "Novel", `layout_footer_tagline`; xóa `layout_footer_copyright` | |
| `apps/web/e2e/site-theme.spec.ts:35-40,58,65,71,104` | Playwright chạy Desktop Chrome nên nút "Tài khoản" của khách bị ẩn. Kịch bản khách chuyển sang radio ở footer; giữ một kịch bản menu với viewport 390; kịch bản thành viên giữ nguyên. Thêm kịch bản footer | hiện 12 test |
| `apps/web/e2e/follows-notifications.spec.ts:87` | Kiểm link Đăng nhập thay cho nút khách | |

## Implementation Steps

1. Tạo `SiteLogo` theo thông số trên, màu qua class `fill-primary`, `fill-(--cover-fg)`.
2. `SiteHeader`: bỏ `<span>` chữ S và `font-serif`. Link Khám phá và Bảng xếp hạng: icon `xl:hidden`, nhãn `sr-only xl:not-sr-only`.
3. Thêm `HeaderLibraryLink` hiện cho mọi người từ `md`, cùng kiểu. `<Link to="/library" search={{ shelf: 'reading', page: 1 }}>`. Khách tới đây thấy `GuestInvite` có sẵn, không bị chuyển hướng (`routes/library.tsx:55`).
4. `HeaderNav` chỉ còn Viết truyện, giữ `signed-in-hint` khi đang tải.
5. `SiteAccountMenu`: thêm `GuestAuthLinks`. Khi pending: dưới `md` giữ ô 42px hiện có; từ `md` hiện `GuestAuthLinks` lớp `guest-hint` và ô chữ cái `signed-in-hint`. Khi là khách: `GuestAccountMenu` bọc `md:hidden`, cộng `GuestAuthLinks` `hidden md:flex`. Bọc bằng `display:none` theo viewport để Playwright strict mode chỉ thấy một bản.
6. `SiteFooter`: bố cục `flex flex-wrap justify-between`, dùng `ChoiceGroup` với `useSiteTheme`, `SITE_THEME_LABELS`, `legendClassName="sr-only"`, chỉnh qua `className`. Cao ≥ 44 trên mobile. Chỉ mở rộng `ChoiceGroup` nếu `className` không đủ, không tạo control mới.
7. Cập nhật e2e ở viewport mặc định từ menu sang link theo bảng file. Giữ menu ở `header-mobile.spec.ts`.

## Test Matrix

| Mức | Kịch bản | Nơi |
|-----|----------|-----|
| Critical | Khách từ `md` thấy link Đăng nhập, Đăng ký; đăng nhập xong quay lại trang đang ở | `e2e/layout-polish.spec.ts` |
| Critical | HTML `/` không có `set-cookie`, không chứa tên tài khoản | `e2e/layout.spec.ts` |
| High | 360px và 390px khách và thành viên không cuộn ngang, vẫn tới được đăng nhập | `e2e/header-mobile.spec.ts` |
| High | 768px, 1280px header không tràn | `e2e/layout.spec.ts` |
| High | Vị trí icon header ở 390 giống nhau trước và sau khi `/me` trả về, với khách | `e2e/header-mobile.spec.ts` |
| High | Chọn "Tối" ở footer đổi `data-theme`, giữ sau tải lại; HTML SSR không có `data-theme` | `e2e/site-theme.spec.ts` |
| Medium | Footer không làm trùng tên ở `getByRole('region', { name: 'Giao diện' })` trên `/settings` | `e2e/site-theme.spec.ts` |

## Interface Checklist

- [ ] `SiteLogo`
- [ ] `HeaderLibraryLink`, `GuestAuthLinks`, `ChoiceGroup` ở footer
- [ ] Placeholder `.guest-hint`/`.signed-in-hint` trong `SiteAccountMenu`

## Dependency Map

Cần font ở phase 1. Phase 3-6 không sửa header, footer.

## Success Criteria

- [ ] Header, footer khớp board ở 1440px; 390px khớp trừ nút tròn của khách đã ghi nhận
- [ ] Không còn `font-serif` trong `site-header.tsx`
- [ ] Khách và thành viên không thấy nháy dạng sai khi tải trang có hint
- [ ] Gate xanh

## Risk Assessment

- Footer thêm trạng thái client trên mọi trang: chỉ `aria-pressed` đổi, không ảnh hưởng cache.
