# Code review: Phase 1 — Design tokens và nền UI

Ngày: 2026-10-05 · Phạm vi: diff chưa commit của phase 1 (tokens, shadcn, SiteLayout, 404/error, restyle auth) · Điểm: **8/10**

## Phạm vi và kiểm chứng

- File: `apps/web/src/styles/*`, `apps/web/src/lib/{utils,contrast,contrast.test,me}.ts`, `apps/web/src/components/{site-layout,not-found,auth-ui}.tsx`, `apps/web/src/components/ui/*` (10 file), `router.tsx`, `routes/{__root,index,sign-*,forgot-password,reset-password}.tsx`, `vi.json`, `e2e/layout.spec.ts`, `docs/design-guidelines.md`, `package.json`, `tsconfig.json`, `components.json`.
- Chạy lại: `vitest` cho tokens + contrast (22/22 xanh), `tsc --noEmit` của web (sạch). Tin gate còn lại theo báo cáo.
- Đọc mã nguồn `@tanstack/react-router/dist/esm/Match.js` để kiểm vị trí error boundary của root.
- Tự tính tương phản cho trạng thái không có trong `TOKEN_VALUES` (ring alpha, hover `/90`, destructive dark `/60`).

## (a) Success criteria

| Tiêu chí | Kết quả |
|---|---|
| tokens light/dark/6 preset đúng giá trị đã duyệt, test tương phản xanh | Đạt (đối chiếu từng hex với bảng plan; drift test có) |
| 10 component, không bóng đổ, không chuỗi tiếng Anh hiển thị | Đạt (`shadow-*` chỉ còn trong `transition-[color,box-shadow]`, "Close" → `m.layout_close()`, không còn `"use client"`) |
| Self-host font, preload 4 file, Noto Serif/Inter không tải | Đạt (e2e kiểm cả hai) |
| 404 trả status 404, auth e2e xanh | Đạt |
| `design-guidelines.md` có "chưa có" + bảng token | Đạt |
| Function checklist (`cn`, `parseHex`, `contrastRatio`, `SiteLayout`, `NotFoundPage`, `ErrorPage`, `useSignOut`) | Đạt. `CONTRAST_PAIRS` dời sang `token-values.ts` (tốt hơn plan: phase 3 import được) |

## (b)–(f) Tóm tắt

- (b) Auth không regress: `TextField` dùng `useId` + `htmlFor`, `getByLabel` vẫn khớp; `FormMessage` thêm `tone` mặc định `'error'` nên caller cũ không đổi; `useMe` chỉ thêm `body.cancel()`.
- (c) Contract: chỉ thêm (`tone?`, `textLinkClass`, `useSignOut`); không đổi export cũ.
- (d) Comment/test name tiếng Anh, không có số phase, mọi chuỗi qua `m.*()`. Lỗi `'No active session'` trong `index.tsx` không ra UI (`authErrorMessage` trả câu chung).
- (e) SSR: `AccountMenu` luôn render placeholder vì `useQuery` không fetch ở server, client render đầu cũng `isPending` → khớp. Có một rủi ro lệch năm ở footer (L1).
- (f) 404 status đúng; nhãn trigger dropdown có vấn đề (M3); focus ring không đạt 3:1 (M2).

## Critical

Không có.

## High

Không có.

## Medium

**M1. Lỗi ở cấp root làm `ErrorPage` tự crash** — `apps/web/src/components/not-found.tsx:45`, `apps/web/src/routes/__root.tsx:41-50`, `apps/web/src/components/site-layout.tsx:45`
`Match.js`: root match bọc `CatchBoundary(defaultErrorComponent)` quanh `MatchInner` (tức `RootComponent`); ở server, `match.status === 'error'` render thẳng error component thay cho `RootComponent`. Vậy khi lỗi xảy ra ở root (`head()`, `beforeLoad`, render của `RootComponent`, hoặc lỗi bubble lên từ error component con), `ErrorPage` → `SiteLayout` → `useMe()` chạy **ngoài `QueryClientProvider`** → ném "No QueryClient set" → trang trắng/500, và còn thiếu `<html>/<head>` (không có CSS). Trước phase này `ErrorComponent` mặc định ít ra còn render được.
Sửa: chuyển `RootDocument` + `QueryClientProvider` sang `shellComponent` của root route (Match.js:75 bọc shell ra ngoài cả boundary), hoặc cho `ErrorPage` một khung tĩnh không gọi `useMe`. Lỗi trong route con vẫn ổn vì render bên trong `Outlet`.

**M2. Focus ring không đạt 3:1 (WCAG 1.4.11)** — `apps/web/src/components/ui/button.tsx:7` (và input, checkbox, select, badge, `app.css:56` `outline-ring/50`)
`ring-ring/50` trên nền: light **2.20:1**, dark **2.48:1**. Với `ghost`/`default` (không có border) halo này là chỉ báo focus duy nhất, gồm cả link "Đăng nhập" và trigger tài khoản ở header. Input không bị vì có `border-ring` màu đặc (5.66:1). Mặc định của shadcn, nhưng plan yêu cầu AA và test token không bắt được alpha.
Sửa: `ring-ring/70` (3.20 / 3.62) hoặc `ring-ring` đặc. Thêm cặp `{ bg: '--background', fg: '--ring', min: 3 }` vào `CONTRAST_PAIRS` để giữ màu gốc. Đây là đổi giao diện so với shadcn, nên để user chốt.

**M3. `aria-label` trên trigger dropdown đè tên hiển thị** — `apps/web/src/components/site-layout.tsx:68`
Tên truy cập thành "Tài khoản" trong khi chữ hiển thị là `displayName`: vi phạm WCAG 2.5.3 (Label in Name), người dùng voice control nói tên hiển thị sẽ không khớp, screen reader không đọc tên. Sửa: bỏ `aria-label` (Radix đã có `aria-haspopup`/`aria-expanded`), nếu cần ngữ cảnh thì thêm `<span className="sr-only">{m.layout_account_menu()}: </span>` trước tên.

## Low

**L1. Năm ở footer có thể lệch lúc hydrate** — `site-layout.tsx:86`
`new Date().getFullYear()` chạy cả server lẫn client. Server UTC, client VN UTC+7: từ 17:00 UTC ngày 31/12 hai bên ra năm khác nhau. Spec mục 6 còn cho CDN cache HTML lâu (`s-maxage` + SWR), nên HTML năm cũ có thể hydrate sang năm mới. React 19 báo hydration error và render lại phía client. Sửa: `suppressHydrationWarning` trên `div` của footer (chỉ chứa text), hoặc lấy năm từ hằng build-time.

**L2. Mỗi lần điều hướng client đều gọi `GET /api/v1/me`** — `lib/me.ts:14`
`SiteLayout` là component theo trang nên `AccountMenu` mount lại mỗi lần điều hướng; `staleTime` mặc định là 0 nên lần mount nào cũng refetch, cộng thêm refetch khi focus lại cửa sổ. Không bị nháy (vẫn có data trong cache), nhưng tốn request. Sửa: đặt `staleTime` cho query `me` (ví dụ 60s). Sign-in đã `invalidate`, sign-out đã `setQueryData`, nên không bị dữ liệu cũ.

**L3. Logo header dùng `reloadDocument`** — `site-layout.tsx:33-34`
Comment viện lý do "home HTML được cache ở CDN", nhưng điều hướng SPA vốn không chạm CDN. Bấm logo là reload cả trang, mất cache react-query, tải lại `/me` và hydrate lại. Cần xác nhận có lý do thật (ví dụ thoát trạng thái notFound); nếu không thì bỏ. Ở `not-found.tsx:35` thì có thể giữ.

**L4. `FormMessage tone="info"` vẫn là `role="alert"`** — `auth-ui.tsx:57`
Thông báo thành công nên dùng `role="status"` (polite). e2e chỉ dùng `getByRole('alert')` cho lỗi (`auth.spec.ts:51`), nên đổi không ảnh hưởng test.

**L5. `TextField` cho caller ghi đè `id`/`aria-describedby`** — `auth-ui.tsx:31`
`{...input}` spread sau `id`: nếu caller truyền `id`, `htmlFor` của label vẫn trỏ vào id sinh ra, làm `getByLabel` hỏng. Hiện chưa caller nào truyền `id`. Sửa: spread trước, hoặc `Omit<…, 'id'>`.

**L6. Hai landmark `<nav>` không có tên ở trang chủ** — `site-layout.tsx:54`, `routes/index.tsx:51`. Thêm `aria-label`.

**L7. Thiếu test cho luồng đăng xuất qua dropdown header** (`useSignOut` gọi từ menu). Hiện `auth.spec.ts` chỉ bấm nút trên trang chủ. Nên thêm một bước e2e mở menu rồi đăng xuất.

**L8. `useMe` dùng `retry` mặc định (3 lần, backoff)**: khi API lỗi 5xx, header giữ placeholder khoảng 7s rồi hiện link khách dù user đang đăng nhập. Chấp nhận được ở giai đoạn này, chỉ ghi lại.

## Ghi chú kiểm chứng (không phải lỗi)

- Hover `bg-primary/90`: 4.70 (light) / 5.15 (dark), đạt. Destructive dark `/60` với chữ trắng: 5.61, đạt. Muted-foreground trên secondary/accent: 5.04 / 5.69, đạt.
- Specificity: `[data-reader-theme]` và `:root` (kể cả trong media dark) cùng là (0,1,0); preset khai báo sau nên thắng. Đúng như thiết kế.
- `tw-animate-css` có dùng thật (`animate-in`/`fade-*`/`zoom-*` trong dialog, sheet, select, dropdown). Có tôn trọng reduced-motion (rule toàn cục trong `app.css:65`).

## Recommended actions

1. M1: chuyển shell + provider sang `shellComponent` (hoặc cho ErrorPage khung tĩnh).
2. M3: bỏ `aria-label` ở trigger.
3. M2: hỏi user về độ đậm của focus ring; thêm cặp `--ring` vào `CONTRAST_PAIRS`.
4. L1, L2, L4, L5: sửa nhỏ, mỗi cái một dòng.

## Câu hỏi còn mở

- `reloadDocument` ở logo header là có chủ đích hay không (L3)?
- Chấp nhận lệch khỏi mặc định shadcn cho focus ring (M2)?

Status: DONE_WITH_CONCERNS
Summary: Đạt mọi success criteria, không regress auth và contract. Còn 3 vấn đề Medium: ErrorPage ở cấp root crash vì nằm ngoài QueryClientProvider/shell, focus ring 50% chỉ đạt 2.2–2.5:1, aria-label đè tên hiển thị ở trigger tài khoản.
