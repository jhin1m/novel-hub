# Research: TanStack Start SSR + UI (Giai đoạn 1, 2026-10-04)

Ghi lại từ kết quả researcher (harness của researcher không cho ghi file). Versions: start 1.168.60, router 1.170.41, zod 4.6, Vite 8. **[src]** = đọc source trong `node_modules`; **[docs]** = docs chính thức; **[unverified]** = chưa thử.

## 1. Cache-Control, 404, 301
- Route option `headers: (ctx) => Record<string,string>` (async, nhận `loaderData`, chạy sau loader) **[src]**. `getStartResponseHeaders` merge `match.headers` của mọi match → **chỉ đặt cache header ở route lá, không ở root**.
```ts
export const PUBLIC_CACHE = { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' };
export const Route = createFileRoute('/truyen/$storyKey/')({
  loader: ({ params }) => getStoryPage({ data: params.storyKey }),
  headers: () => PUBLIC_CACHE,
});
```
- `setResponseHeader` chỉ chạy trong code server; với navigation SSR header từ server fn không chắc tới document → dùng route `headers`.
- 404 không được cache dài: `headers()` đọc `loaderData` rỗng → `s-maxage=60` hoặc `no-store`. Cần test.
- Không gọi Better Auth/`getSession` trong root `beforeLoad`/loader. E2E assert không có `set-cookie` trên trang công khai.
- Cloudflare mặc định không cache HTML → cần Cache Rule; SWR theo gói **[unverified]**.
- `throw notFound()` → document 404 **[src]**; `defaultNotFoundComponent` + `notFoundComponent` ở route truyện/chương.
- `redirect({ statusCode: 301, headers })` hỗ trợ (mặc định 307) **[src]**; SSR redirect cần path tuyệt đối + params tĩnh.
```ts
loader: async ({ params }) => {
  const key = parseStoryKey(params.storyKey); // lastIndexOf('-'); sai → notFound()
  const story = await getStoryPage({ data: key.publicId });
  if (!story) throw notFound();
  if (key.slug !== story.slug) throw redirect({ to: '/truyen/$storyKey',
    params: { storyKey: `${story.slug}-${story.publicId}` }, statusCode: 301, headers: PUBLIC_CACHE });
  return story;
}
```
- Route chương: `truyen.$storyKey.chuong-{$number}.tsx` (prefix param) **[unverified]**; fallback: param `$chapterSlug`, tự parse `chuong-(\d+)`, sai → `notFound()`. `parseStoryKey` đặt ở `packages/shared`.

## 2. Loader và code server
- Loader isomorphic → không import `core` trực tiếp. Dùng `createServerFn({ method: 'GET' }).inputValidator(zod).handler(...)` trong `apps/web/src/server-fns/*`; SSR gọi in-process, client navigation thành RPC.
- `getInfra()` trong `src/server/api-app.ts` đang private → tách `server/infra.ts` export deps dùng chung pool (cache `globalThis`) cho Hono và server fn.
- CSRF mặc định của Start áp cho server fn (Sec-Fetch-Site → Origin → Referer) **[src]**; `/api/$` do Hono csrf lo.
- Trang công khai: trả `loaderData` thẳng từ server fn (không TanStack Query). Dữ liệu cá nhân: `useQuery` + `hc` ở browser (như `useMe`). `@tanstack/react-router-ssr-query` ngoài mục 2 → không dùng.
- Đặt `defaultStaleTime` (30–60s) và `defaultPreloadStaleTime` trên router.
- ESLint: thêm `apps/web/src/server-fns/**` vào `ignores` của rule chặn import (đã ghi ở phase 4 Giai đoạn 0).

## 3. head(), canonical, robots, sitemap
- `head({ loaderData })` → `meta` (title, description, og:*), `links` canonical; `loaderData` có thể undefined khi loader throw. Truyện 18+: `robots noindex` (+ `X-Robots-Tag` trong `headers()`).
- `APP_URL` cho canonical/OG: truyền qua loader data từ server fn (không import env ở client).
- Server route: `routes/sitemap[.]xml.ts` → `/sitemap.xml`, `robots[.]txt.ts` **[docs]**. Phân trang: `/sitemap/stories/$page` an toàn hơn param kèm hậu tố **[unverified]**.

## 4. Script inline trước khi vẽ
- Khuyến nghị: `<script dangerouslySetInnerHTML={{ __html: READER_BOOT }} />` là con đầu tiên của `<head>` trong `RootDocument` (chuỗi tĩnh → không mismatch); `suppressHydrationWarning` trên `<html>`.
- Script: try/catch, đọc `localStorage['reader']`, validate allowlist, đặt `data-*` và CSS vars trên `<html>`. CSS selector `[data-reader-theme=sepia]`. React lần render đầu không phụ thuộc cài đặt. Không lưu vào cookie.

## 5. shadcn/ui + Tailwind v4
- `pnpm dlx shadcn@latest init` **trong `apps/web`** (không `--monorepo`). Cần `paths: {"@/*": ["./src/*"]}` trong `apps/web/tsconfig.json`; `components.json` trỏ `src/styles/app.css`, `cssVariables: true`.
- Token: biến `:root`/`.dark` OKLCH + `@theme inline`; bỏ palette mặc định của shadcn; `--radius` nhỏ, bỏ shadow.
- Dep: `radix-ui` (umbrella), `class-variance-authority`, `lucide-react`, `tw-animate-css`. **Xung đột:** shadcn init (9/2026) dùng package `cn` thay `clsx` + `tailwind-merge`; spec mục 2 ghi clsx/tailwind-merge → hỏi user (hoặc tự viết `lib/utils.ts` với clsx + tailwind-merge).
- Component tối thiểu: button, input, textarea, label, checkbox, select, dialog, sheet, dropdown-menu, badge (popover tuỳ). `sonner` ngoài mục 2 → dùng thông báo inline như `FormMessage`.

## 6. Font (đã giải nén tarball npm)
| Font | Package | Ghi chú |
|---|---|---|
| Literata | `@fontsource-variable/literata` 5.3.0 | wght 200–900, có subset vietnamese (11 KB) |
| Be Vietnam Pro | `@fontsource/be-vietnam-pro` 5.3.0 | không có bản variable; static 400/500/600/700 |
| Noto Serif | `@fontsource-variable/noto-serif` 5.3.0 | |
| Inter | `@fontsource-variable/inter` | |
- `@import` cả bốn tĩnh trong `app.css`: `@font-face` có `unicode-range`; browser chỉ tải woff2 khi có text dùng font đó → Noto Serif/Inter chỉ tải khi người đọc chọn.
- Preload: Literata latin + vietnamese (`...woff2?url`, `crossOrigin: 'anonymous'`), Be Vietnam Pro 400. Package fontsource là dep mới ngoài mục 2 → cần duyệt.

## 7. Trang đọc
- Prefetch ~70%: `IntersectionObserver` trên sentinel → `router.preloadRoute(...)` **[src]**. Preload không được tính view.
- Phím ←/→: bỏ qua khi focus input/textarea/contenteditable, có modifier, hoặc dialog đang mở.
- Thanh điều hướng ẩn/hiện: passive scroll + rAF, `data-hidden` + transform; tôn trọng `prefers-reduced-motion`.
- `sendBeacon`: `hono/csrf` cho qua khi `Sec-Fetch-Site: same-origin` hoặc Origin khớp `APP_URL` → `APP_URL` phải đúng origin thật (dev/prod/e2e). Gửi `Blob` type `application/json` để dùng `zValidator('json')`. Cookie đi kèm (same-origin). Endpoint trả 204 `no-store`; ~64 KB; rate limit. Kích hoạt ở `visibilitychange`/`pagehide`.

## 8. Search params `/tim-kiem`
- Zod 4 dùng trực tiếp `validateSearch: schema` **[docs]**; `.catch()` cho input người gõ. `loaderDeps: ({ search }) => search` bắt buộc. Schema để ở `packages/shared`, dùng lại cho `zValidator('query')` của Hono. Trang tìm kiếm cache ngắn hoặc `no-store`; SSR không có truyện 18+.

## 9. Playwright
- Có sẵn `gotoHydrated` (goto + networkidle). Kiểm header SSR: `request.get(url, { maxRedirects: 0 })` → 301 + `Location`, 404, `cache-control`, không `set-cookie`. Test `javaScriptEnabled: false` chứng minh nội dung chương có trong HTML SSR.
- E2E chạy `vite dev` → header có thể khác bản build; cân nhắc kiểm header trên `vite build` + `start`.
- Global setup truncate mọi bảng → seed trong test/global-setup. Đăng nhập một lần + `storageState`. Locator mới ưu tiên `getByRole`/test id.

## Câu hỏi chưa giải quyết
1. Package `cn` (shadcn mới) hay `clsx` + `tailwind-merge` theo spec?
2. `sonner` hay thông báo inline?
3. `@tanstack/react-router-ssr-query`? (đề xuất: không)
4. Cloudflare plan/cache rule cho HTML + SWR?
5. Sitemap phân trang: `/sitemap/stories/$page`?
6. `APP_URL` tới `head()` phía client: qua loader data?
7. E2E kiểm header trên bản build?
