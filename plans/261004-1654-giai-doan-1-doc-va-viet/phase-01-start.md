---
phase: 1
title: "Phase 1: Design tokens và nền UI"
status: pending
priority: P1
effort: "1.5d"
dependencies: []
---

# Phase 1: Design tokens và nền UI

Spec checkbox: không có (user thêm ngày 2026-10-04 để có tokens trước khi dựng UI). Không đánh `[x]` checkbox nào khi xong.

## Context Links

- Spec mục 2 (Tailwind v4, shadcn/ui chỉ thêm component cần, `lucide-react`), mục 8 (ngôn ngữ thiết kế), mục 9 (i18n, không hardcode chuỗi)
- `plan.md`: quyết định "Dependency mới" và câu hỏi mở #1 (màu nhấn), #2 (duyệt dep)
- `plans/reports/researcher-261004-2352-tanstack-start-ssr-ui-report.md` mục 5 (shadcn + Tailwind v4), mục 6 (font)
- Code hiện có: `apps/web/src/styles/app.css` (chỉ `@import 'tailwindcss'`), `apps/web/src/routes/__root.tsx`, `apps/web/src/router.tsx`, `apps/web/src/components/auth-ui.tsx`, `apps/web/vite.config.ts` (đã bật `resolve.tsconfigPaths`)

## Overview

- Dựng một nguồn tokens duy nhất ở `apps/web/src/styles/tokens.css`: màu trung tính ấm light/dark, một màu nhấn, bộ preset nền trang đọc, font, bo góc.
- Self-host 4 font qua `@fontsource*`, preload font giao diện và font nội dung.
- Khởi tạo shadcn/ui trong `apps/web` với đúng 10 component tối thiểu, tự viết `lib/utils.ts` (`clsx` + `tailwind-merge`).
- Khung trang `SiteLayout` (header + footer tối giản), trang 404 mặc định, restyle trang auth sang component mới.
- Viết `docs/design-guidelines.md`. Không có logic nghiệp vụ.

## Key Insights

- Spec mục 8: "file tokens trong repo là chuẩn". Màu viết **hex** (không OKLCH). Test tương phản **không parse CSS**: bảng hằng TS `TOKEN_VALUES` (cùng giá trị) được kiểm tương phản, rồi đối chiếu từng cặp `--tên: #HEX;` có mặt nguyên văn trong `tokens.css` (so chuỗi). Lệch giá trị giữa hai nơi → test đỏ. <!-- Red Team: bỏ parser CSS tự viết -->
- Màu nhấn (user chốt ở validate): **đất nung** light `#A8432A` (5.66:1 trên `#FBF8F3`), dark `#D9825F` (6.04:1 trên `#1C1A18`). Bảng trung tính và 6 preset dưới đây **đã duyệt nguyên văn**. <!-- Updated: Validation Session 1 - accent + palette -->
- Dark mode theo `prefers-color-scheme` (CSS media), không cần script, không nháy nền, không có nút chuyển (spec không yêu cầu). Biến thể `dark:` mặc định của Tailwind v4 cũng dựa trên media này nên shadcn chạy đúng.
- Preset trang đọc chỉ khai báo CSS (`[data-reader-theme='…']`); script boot, bảng tuỳ chỉnh, Zod preferences thuộc phase 8.
- `SiteLayout` là **component** để từng trang tự bọc, không phải pathless layout route: trang đọc (phase 7) và editor chế độ tập trung (phase 4) không dùng header site; tránh phải dời file route.
- Header site render giống hệt cho mọi người ở SSR (cache được); vùng tài khoản dùng `useMe()` ở client, SSR chỉ render khung giữ chỗ cố định kích thước.
- shadcn init (9/2026) mặc định kéo package `cn`; spec ghi `clsx` + `tailwind-merge` → không chạy `init`, tự tạo `components.json` + `lib/utils.ts`, chỉ dùng `shadcn add`.
- `@fontsource` khai báo `@font-face` có `unicode-range`; trình duyệt chỉ tải woff2 khi có chữ dùng font đó, nên import tĩnh cả 4 font vẫn không làm trang nặng (Noto Serif, Inter chỉ tải khi người đọc chọn ở phase 8).

## Requirements

**Functional**

- Tokens (tên theo quy ước shadcn để component chạy không cần sửa):
  - `--background`, `--foreground`, `--card(-foreground)`, `--popover(-foreground)`, `--primary(-foreground)` (= màu nhấn), `--secondary(-foreground)`, `--muted(-foreground)`, `--accent(-foreground)` (nền hover của shadcn, **không** phải màu nhấn), `--destructive`, `--border`, `--input`, `--ring`, `--radius`.
  - Light ở `:root`, dark ở `@media (prefers-color-scheme: dark) { :root { … } }`.
  - Trang đọc: `--reader-bg`, `--reader-fg`, `--reader-muted` cho 6 preset `sang`, `nga`, `sepia`, `xanh-diu`, `xam-toi`, `den-oled` qua selector `[data-reader-theme='…']`; mặc định (không có thuộc tính) = `nga` khi light, `xam-toi` khi dark.
  - Font: `--font-sans` (Be Vietnam Pro), `--font-serif` (Literata), `--font-reader-noto-serif`, `--font-reader-inter`; map vào `@theme inline`.
  - Bo góc nhỏ (`--radius: 0.375rem`), không gradient, bỏ bóng đổ trong component shadcn (xoá class `shadow-*` khi add).
- Font self-host: Literata (variable, thường + nghiêng), Be Vietnam Pro 400/500/600/700, Noto Serif (variable, thường + nghiêng), Inter (variable). Preload: Literata subset `vietnamese` + `latin`, Be Vietnam Pro 400 `vietnamese` + `latin`.
- Component `apps/web/src/components/ui/`: `button`, `input`, `textarea`, `label`, `checkbox`, `select`, `dialog`, `sheet`, `dropdown-menu`, `badge`.
- `SiteLayout({ children })`: `<header>` (tên site link về `/`, vùng tài khoản: khách → "Đăng nhập", "Đăng ký"; đã đăng nhập → dropdown tên hiển thị + "Đăng xuất"), `<main>`, `<footer>` (tên site + năm; link điều khoản/quy định do phase 10 thêm khi có trang).
- Router: `defaultNotFoundComponent` (trang 404 trong `SiteLayout`, link về trang chủ), `defaultErrorComponent` tối giản, `defaultStaleTime: 30_000`, `defaultPreloadStaleTime: 30_000`.
- Trang auth (`dang-ky`, `dang-nhap`, `quen-mat-khau`, `dat-lai-mat-khau`) và `/` tạm thời dùng `Button`, `Input`, `Label` mới, bọc `SiteLayout`; giữ nguyên label/tên nút để e2e auth hiện có không đổi.
- `docs/design-guidelines.md`: link Design System và mockup (để trống "chưa có" nếu user chưa cung cấp), nguyên tắc mục 8, bảng token và ý nghĩa, ánh xạ "màu nhấn" = `--primary`, cách thêm component shadcn, danh sách preset trang đọc, quy tắc tương phản AA.

**Non-functional**

- Mọi cặp chữ/nền khai báo trong tokens đạt WCAG AA 4.5:1 (viền ô nhập đạt 3:1 theo 1.4.11), kiểm bằng unit test.
- Mọi chuỗi mới đi qua Paraglide (`packages/shared/messages/vi.json`, tiền tố `layout_`, `notfound_`, `error_page_`).
- Không thêm `sonner`, không thanh tiến trình chuyển trang, tôn trọng `prefers-reduced-motion` cho animation của dialog/sheet.

## Architecture

```
apps/web/src/styles/
  tokens.css      ← nguồn chuẩn: :root (light) · @media dark · [data-reader-theme=*]
  app.css         ← @import 'tailwindcss'; fontsource css; './tokens.css' (+ 'tw-animate-css' chỉ khi component cần)
                    @theme inline { --color-*: var(--*); --font-*; --radius-* }
                    @layer base { body { bg-background text-foreground font-sans } }
  token-values.ts ← TOKEN_VALUES: bảng hằng hex theo scope (light, dark, reader preset; phase 3 thêm cover)
  tokens.test.ts  ← tương phản trên TOKEN_VALUES + đối chiếu chuỗi `--tên: #HEX;` có trong tokens.css
apps/web/src/lib/utils.ts         cn(...inputs) = twMerge(clsx(inputs))
apps/web/src/lib/contrast.ts      contrastRatio(hexA, hexB): number   (dùng cho test, phase 3 dùng lại)
apps/web/src/components/ui/*      shadcn (radix-ui, cva)
apps/web/src/components/site-layout.tsx   SiteLayout, SiteHeader, AccountMenu (client, useMe)
apps/web/src/components/not-found.tsx     NotFoundPage, ErrorPage
apps/web/src/router.tsx            defaultNotFoundComponent, defaultErrorComponent, stale time
apps/web/src/routes/__root.tsx     links: stylesheet + preload font (import '...woff2?url')
```

Giá trị đã duyệt ở validate (đã tính tương phản):

| Token | Light | Dark | Tương phản với nền |
|---|---|---|---|
| `--background` / `--foreground` | `#FBF8F3` / `#2A2724` | `#1C1A18` / `#ECE6DD` | 14.0 / 14.0 |
| `--muted-foreground` | `#6B645C` | `#A89F94` | 5.5 / 6.7 (trên `--muted` `#F2EEE7`/`#2A2724`: 5.0 / 5.7) |
| `--destructive` | `#A3342B` | `#E5806F` | 6.4 / 6.3 |
| `--input` (viền ô nhập) | `#8A8278` | `#6F675E` | 3.6 / 3.1 |
| `--border` (đường kẻ trang trí) | `#E4DED4` | `#3A3632` | không yêu cầu |
| `--primary` / `--primary-foreground` | `#A8432A` / `#FBF8F3` | `#D9825F` / `#1C1A18` | 5.66 / 6.04 (nền và chữ trên nút bằng nhau vì cùng cặp) |

| Preset | `--reader-bg` | `--reader-fg` | `--reader-muted` | fg / muted |
|---|---|---|---|---|
| `sang` | `#FFFFFF` | `#1F1F1F` | `#5F5F5F` | 16.5 / 6.4 |
| `nga` | `#FBF6EC` | `#2B2722` | `#675F55` | 13.8 / 5.8 |
| `sepia` | `#F4ECD8` | `#3B2F22` | `#6A5A47` | 11.0 / 5.6 |
| `xanh-diu` | `#E6EFE4` | `#22302A` | `#4E5F55` | 11.7 / 5.8 |
| `xam-toi` | `#2B2B2B` | `#D6D3CE` | `#A3A09B` | 9.5 / 5.4 |
| `den-oled` | `#000000` | `#C9C5BE` | `#8F8B85` | 12.2 / 6.2 |

```ts
// apps/web/src/styles/token-values.ts — phase 3 thêm scope `cover`
type Scope = Record<`--${string}`, `#${string}`>;
export const TOKEN_VALUES: { light: Scope; dark: Scope; reader: Record<ReaderPreset, Scope> };
// dark và từng preset kế thừa light khi thiếu biến (spread khi dựng scope trong test)
// apps/web/src/styles/tokens.test.ts
export const CONTRAST_PAIRS: ReadonlyArray<{ bg: string; fg: string; min: number }> = [
  { bg: '--background', fg: '--foreground', min: 4.5 },
  { bg: '--background', fg: '--muted-foreground', min: 4.5 },
  { bg: '--muted', fg: '--muted-foreground', min: 4.5 },
  { bg: '--card', fg: '--card-foreground', min: 4.5 },
  { bg: '--popover', fg: '--popover-foreground', min: 4.5 },
  { bg: '--primary', fg: '--primary-foreground', min: 4.5 },
  { bg: '--background', fg: '--primary', min: 4.5 },     // link dùng màu nhấn
  { bg: '--background', fg: '--destructive', min: 4.5 },
  { bg: '--background', fg: '--input', min: 3 },
  { bg: '--reader-bg', fg: '--reader-fg', min: 4.5 },     // lặp cho mọi block [data-reader-theme]
  { bg: '--reader-bg', fg: '--reader-muted', min: 4.5 },
];
```

Test: với mỗi scope (`light`, `dark` = light + dark, từng preset = light + preset) kiểm mọi cặp `CONTRAST_PAIRS` có đủ hai biến; rồi với mỗi `(tên, giá trị)` trong `TOKEN_VALUES` kiểm `tokensCss.toLowerCase().includes(`${tên}: ${giá trị}`.toLowerCase())`. Giới hạn chấp nhận: so chuỗi không kiểm biến nằm đúng scope; giữ mỗi giá trị trên một dòng `--tên: #HEX;`. <!-- Red Team: không viết parser CSS -->

## File Inventory

| File | Action | Ghi chú |
|---|---|---|
| `apps/web/package.json` | modify | `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, 4 gói `@fontsource*` (đã duyệt); `tw-animate-css` chỉ khi component shadcn đã add thật sự dùng class của nó <!-- Red Team: chỉ thêm dep khi cần --> |
| `apps/web/tsconfig.json` | modify | `baseUrl` không cần; thêm `paths: { "@/*": ["./src/*"] }` |
| `apps/web/components.json` | create | `style: new-york`, `tailwind.css: src/styles/app.css`, `cssVariables: true`, `aliases.utils: @/lib/utils`, `iconLibrary: lucide` |
| `apps/web/src/styles/tokens.css` | create | nguồn chuẩn tokens |
| `apps/web/src/styles/app.css` | modify | import tokens, font, `@theme inline`, base layer |
| `apps/web/src/styles/{token-values.ts,tokens.test.ts}` | create | bảng hằng + kiểm tương phản + đối chiếu chuỗi |
| `apps/web/src/lib/utils.ts` | create | `cn` |
| `apps/web/src/lib/contrast.ts` (+ `.test.ts`) | create | `contrastRatio`, `parseHex` |
| `apps/web/src/components/ui/{button,input,textarea,label,checkbox,select,dialog,sheet,dropdown-menu,badge}.tsx` | create | qua `shadcn add`, bỏ `shadow-*` |
| `apps/web/src/components/site-layout.tsx` | create | `SiteLayout`, `AccountMenu` |
| `apps/web/src/components/not-found.tsx` | create | `NotFoundPage`, `ErrorPage` |
| `apps/web/src/components/auth-ui.tsx` | modify | dùng `Input`, `Label`, `Button`; `AuthPage` bọc `SiteLayout` |
| `apps/web/src/routes/{index,dang-ky,dang-nhap,quen-mat-khau,dat-lai-mat-khau}.tsx` | modify | thay nút/link sang component mới; không đổi chuỗi |
| `apps/web/src/routes/__root.tsx` | modify | preload font |
| `apps/web/src/router.tsx` | modify | not-found, error, stale time |
| `packages/shared/messages/vi.json` | modify | `layout_*`, `notfound_*`, `error_page_*` |
| `apps/web/e2e/layout.spec.ts` | create | header/footer, 404, preload |
| `docs/design-guidelines.md` | create | |

## Implementation Steps

1. Dùng giá trị đã chốt ở validate: màu nhấn đất nung (bảng trên), dep đã duyệt toàn bộ. <!-- Updated: Validation Session 1 - accent chốt -->
2. Cài dep đã duyệt vào `apps/web` (version chính xác như research: `@fontsource-variable/literata@5.3.0`, `@fontsource/be-vietnam-pro@5.3.0`, `@fontsource-variable/noto-serif@5.3.0`, `@fontsource-variable/inter`). Nếu `minimumReleaseAge` chặn bản mới, chọn bản cũ hơn liền kề; không thêm ngoại lệ vào `pnpm-workspace.yaml`.
3. `tsconfig.json` thêm `paths`; kiểm Vite resolve `@/` nhờ `resolve.tsconfigPaths` (đã bật).
4. Viết `tokens.css` theo bảng trên (sau khi duyệt) và `app.css`:
   - `@import` font: `@fontsource-variable/literata/wght.css`, `.../wght-italic.css`, `@fontsource/be-vietnam-pro/{400,500,600,700}.css`, `@fontsource-variable/noto-serif/wght.css` + italic, `@fontsource-variable/inter/wght.css`. Kiểm tên file thật trong `node_modules` trước khi viết.
   - `@theme inline` ánh xạ `--color-background: var(--background)` …, `--font-sans: 'Be Vietnam Pro', system-ui, sans-serif`, `--font-serif: 'Literata Variable', Georgia, serif`, `--radius-sm/md/lg` từ `--radius`.
   - Sau step 6, `grep -r "animate-in\|fade-in\|zoom-in" src/components/ui`: có class của `tw-animate-css` → cài gói (đã duyệt) + `@import`; không có → không cài. Có animation thì `@media (prefers-reduced-motion: reduce)` tắt.
5. `lib/contrast.ts` (hex 3/6 ký tự → luminance WCAG 2.x → tỉ lệ) + test giá trị chuẩn (`#000`/`#fff` = 21, cùng màu = 1). `token-values.ts` + `tokens.test.ts` như mục Architecture.
6. Tạo `components.json`, `lib/utils.ts`; chạy `pnpm dlx shadcn@latest add button input textarea label checkbox select dialog sheet dropdown-menu badge` trong `apps/web`. Sau đó:
   - so `package.json`: chỉ được thêm dep đã duyệt; CLI đòi `cn` thì gỡ và đổi import sang `@/lib/utils`;
   - xoá class `shadow-*`, giữ `focus-visible:ring`;
   - chuỗi mặc định tiếng Anh trong component (vd. `sr-only` "Close" của dialog/sheet) chuyển sang `m.layout_close()`.
7. `site-layout.tsx`: header `<header role="banner">` (link `m.app_name()` về `/`), `AccountMenu` dùng `useMe()`: pending → khối giữ chỗ cùng kích thước (không nhảy layout), khách → hai link, user → `DropdownMenu` (tên hiển thị, "Đăng xuất" dùng lại logic ở `routes/index.tsx`, tách thành hook `useSignOut` trong `lib/me.ts`). Footer `<footer>` tối giản. Không đọc cookie ở SSR.
8. `not-found.tsx` + `router.tsx`: `defaultNotFoundComponent: NotFoundPage`, `defaultErrorComponent: ErrorPage` (không in stack/message lỗi ra UI), stale time. Kiểm document 404 có HTTP status 404.
9. `__root.tsx`: import URL font bằng `?url` (vd. `@fontsource-variable/literata/files/literata-vietnamese-wght-normal.woff2?url`, tên kiểm trong `node_modules`), thêm `links` `{ rel: 'preload', as: 'font', type: 'font/woff2', href, crossOrigin: 'anonymous' }` cho 4 file đã chọn.
10. Restyle `auth-ui.tsx` và 5 route: giữ nguyên `getByLabel`/`getByRole` mà `e2e/auth.spec.ts` dùng. `FormMessage` giữ `role="alert"`, màu `text-destructive`.
11. Thêm chuỗi vào `vi.json`, `pnpm i18n:compile`.
12. `docs/design-guidelines.md` (mục Requirements). Ghi rõ: khi Design System và repo lệch nhau, `tokens.css` là chuẩn.
13. `e2e/layout.spec.ts` (mục Test). Chạy thủ công: `pnpm dev`, xem `/`, `/dang-nhap`, `/khong-co` ở mobile 375px và desktop, light và dark (DevTools emulate `prefers-color-scheme`); kiểm Network chỉ tải Literata/Be Vietnam Pro, không tải Noto Serif/Inter.
14. Gate: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e`. Không đánh checkbox spec nào; cập nhật bảng phase trong `plan.md` do người cook làm theo quy trình chung.

## Function / Interface Checklist

- [ ] `cn(...inputs: ClassValue[]): string`
- [ ] `contrastRatio(a: string, b: string): number`; `parseHex(hex: string): [r, g, b]`
- [ ] `SiteLayout({ children }: { children: ReactNode })`
- [ ] `NotFoundPage()`, `ErrorPage()`
- [ ] `useSignOut()` (tách từ `routes/index.tsx` vào `lib/me.ts`)
- [ ] 10 component `@/components/ui/*`

## Test Scenario Matrix

| Mức | Kịch bản | Loại |
|---|---|---|
| Critical | Mọi cặp `CONTRAST_PAIRS` ở light, dark và 6 preset đạt ngưỡng | unit `tokens.test.ts` |
| High | Hàm kiểm phát hiện vi phạm: scope giả `--foreground: #CCCCCC` trên nền sáng → trả lỗi; giá trị trong `TOKEN_VALUES` khác `tokens.css` → trả lỗi | unit |
| High | `contrastRatio('#000', '#fff') === 21`, hex 3 ký tự, hex sai → throw | unit `contrast.test.ts` |
| Critical | Luồng auth hiện có vẫn xanh sau restyle | e2e `auth.spec.ts` |
| High | `/` có `banner` và `contentinfo`; khách thấy link "Đăng nhập" sau hydrate | e2e `layout.spec.ts` |
| High | `GET /khong-ton-tai` → status 404, heading trang 404, có link về trang chủ | e2e (`request.get` + page) |
| Medium | HTML `/` có `<link rel="preload" as="font">` cho Literata và Be Vietnam Pro; không có `set-cookie` | e2e |
| Medium | Light/dark, 375px/1280px, không tải Noto Serif/Inter | thủ công |

## Dependency Map

- Cần: Giai đoạn 0 xong (web, auth, `useMe`).
- Phase 2 dùng: component ui, `SiteLayout`, `cn`; thêm link "Viết truyện" vào header.
- Phase 3 dùng: `contrastRatio`, `TOKEN_VALUES` (thêm scope `cover`), `CONTRAST_PAIRS`, token font serif.
- Phase 4 dùng: `--font-serif` cho vùng soạn thảo, `Dialog`.
- Phase 7 dùng: biến `--reader-*` (mặc định), `--font-serif`, `Sheet` (mục lục), `NotFoundPage`. Phase 8 dùng: preset `[data-reader-theme]`, `--font-reader-*`, `Sheet`/`DropdownMenu` cho bảng tuỳ chỉnh.
- Phase 10/16 dùng: `SiteLayout`, footer (phase 10 thêm link điều khoản), `NotFoundPage`.

## Success Criteria

- [ ] `tokens.css` có đủ token light/dark/6 preset, giá trị đã được user duyệt; test tương phản xanh
- [ ] 10 component shadcn chạy với tokens, không có bóng đổ, không có chuỗi tiếng Anh hiển thị
- [ ] Font self-host, preload đúng 4 file; Noto Serif/Inter không tải ở trang thường
- [ ] Trang 404 trả status 404, có giao diện; auth e2e vẫn xanh
- [ ] `docs/design-guidelines.md` có link Design System (hoặc ghi "chưa có") và bảng token
- [ ] Gate 5 lệnh xanh

## Risk Assessment

| Rủi ro | Khả năng × Ảnh hưởng | Giảm thiểu |
|---|---|---|
| shadcn CLI tự thêm dep ngoài danh sách (`cn`, `@radix-ui/*` lẻ, `tw-animate-css`) | Cao × Trung bình | Kiểm diff `package.json` sau mỗi `add`; gỡ và sửa import; `tw-animate-css` giữ chỉ khi có class dùng |
| Tên file woff2 của fontsource khác research | Trung bình × Thấp | Đọc `node_modules/@fontsource*/files` trước khi viết import `?url` |
| Header dùng `useMe` gây lệch hydrate | Thấp × Trung bình | SSR luôn render khối giữ chỗ; chỉ đổi sau khi query xong ở client |
| `defaultNotFoundComponent` trả status 200 | Thấp × Trung bình | E2E kiểm status; nếu sai, dùng route `$` catch-all `throw notFound()` |

Rollback: phase chỉ thêm file UI và đổi style; revert commit của phase là đủ, không có migration hay dữ liệu.

## Security Considerations

- Trang lỗi không hiển thị message/stack.
- Header không đọc cookie phía server → HTML công khai không phụ thuộc phiên.
- Font tải cùng origin (không gọi Google Fonts), không lộ IP người đọc cho bên thứ ba.

## Câu hỏi mở (đã chốt — Validation Session 1, 2026-10-05)

1. Màu nhấn: **đất nung** `#A8432A` / dark `#D9825F` (chữ trên nút `#FBF8F3` / `#1C1A18`).
2. Bảng trung tính và 6 preset: dùng nguyên văn; "xanh dịu" = xanh lá nhạt (`#E6EFE4` / `#22302A`).
3. Chưa có Design System/mockup: `docs/design-guidelines.md` ghi "chưa có".

## Next Steps

Phase 2: tạo và sửa truyện, dùng `SiteLayout` và component ui vừa dựng.
