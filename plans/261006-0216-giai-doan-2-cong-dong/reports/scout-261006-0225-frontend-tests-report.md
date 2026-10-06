# Scout frontend + test cho Giai đoạn 2 (2026-10-06)

## 1. Route (`apps/web/src/routes`)

| Route | File | Cache / SSR |
|---|---|---|
| `/` | `index.tsx` | `publicPageHeaders(status,{list:true})` :26 (CDN 10 phút) |
| `/stories/$storyKey/` | `stories.$storyKey.index.tsx` | public 1 ngày; noindex nếu 18+ :34 |
| `/stories/$storyKey/chapter-{$number}` | `stories.$storyKey.chapter-{$number}.tsx` | public 1 ngày :43 |
| `/authors/$username` | `authors.$username.tsx` | list cache :31 |
| `/tags/$tagSlug` | `tags.$tagSlug.tsx` | list cache :39 |
| `/search` | `search.tsx` | list cache + noindex :28, kết quả tải ở client |
| `/library` | `library.tsx` | `NO_STORE` :35, dữ liệu ở client |
| `/settings` (tab "Tôi") | `settings.tsx` | `NO_STORE` :18 |
| `/moderation` | `moderation.tsx` | `ssr:false` :45 + `NO_STORE` :47 |
| `/write/...` | `write/index.tsx`, `write/stories/new.tsx`, `write/stories/$publicId/index.tsx` | không `headers`, chỉ noindex |
| editor | `write/stories/$publicId/chapters/$number.tsx` | `ssr:false` :17 |

- Chưa có `/notifications`, `/me`, xếp hạng, dashboard.
- Cache helper `src/lib/cache-headers.ts`: `PUBLIC_CACHE` (s-maxage 86400), `LIST_CACHE` (600), `NOT_FOUND_CACHE`, `NO_STORE`, `publicPageHeaders()`; chỉ đặt `headers` ở route lá.

## 2. Trang đọc

- Cuối chương: `<ChapterEnd>` ở `stories.$storyKey.chapter-{$number}.tsx:133-143` trong `<main><div className="reader-column">`. `components/reader/chapter-end.tsx` là `<footer>`: lời nhắn (:26-40), nút tiếp `h-16` (:41-49), nút trước (:50-61), gợi ý bàn phím (:62), `ReportButton` (:65). Doc :9 ghi "Comments come later". Bình luận đặt sau `<ChapterEnd>` (route :143) hoặc cuối footer; dùng token `reader-*` (`bg-reader-card`, `text-reader-muted`, `border-reader-fg/10`).
- Trang đọc không dùng `SiteLayout`; `main` có `inert={gated}` khi 18+; có `useMe()` (:83); HTML cache → bình luận tải ở client.
- `data-pid`: sinh `packages/shared/src/editor/pid.ts` (8 ký tự `[a-z2-9]`, `isValidPid`), render `packages/core/src/content/walker.ts:25-27,56,59` trên `<p>`, `<h2>`, `<h3>`; giữ qua `content/sanitize.ts:10`; chèn bằng `components/reader/chapter-content.tsx:25` (`.reader-content`, `dangerouslySetInnerHTML`). E2E kiểm `.reader-content p[data-pid]` (`e2e/reader.spec.ts:24`).
- Thanh/rail: `components/reader/reader-controls.tsx` `variant="bar"` (mobile, 4 ô) và `variant="rail"` (từ `lg`). `ReaderPanel = 'toc' | 'settings'` (:6). Khác: `reader-top-bar.tsx`, `chapter-toc-sheet.tsx`, `reader-settings-sheet.tsx`, `mature-gate.tsx`, `chapter-header.tsx`. Hook ở `src/lib/reader/`. `ui/sheet.tsx:40-78` có `side="adaptive-right|adaptive-left"` (sheet đáy dưới `lg`, panel từ `lg`).

## 3. Trang truyện, trang tác giả

- Trang truyện `stories.$storyKey.index.tsx:52-128` (`SiteLayout bottomInset="cta"`): `StoryHero` (`components/story/story-hero.tsx`) có `StoryMeta` (:122-129, `story-meta.tsx` `<dl>`) và hàng hành động (:130-145: `ContinueReadingButton` + `LibraryButton tone="on-cover"`) → nút theo dõi truyện đặt ở đây với `ON_COVER_OUTLINE` (`story/on-cover-classes.ts`). Điểm đánh giá: thêm một mục `StoryMeta`. `<article>` (:70-115): giới thiệu → tag → mục lục (`StoryChapterList`) → chỗ cho khu đánh giá. `<aside>` (:116-122): `StoryAuthorCard` + `ReportButton` → chỗ nút theo dõi tác giả. `StoryStickyCta` mobile.
- Trang tác giả `authors.$username.tsx:50-91`: header (avatar chữ, `PageTitle`, @username, bio, `ReportButton` :56-79) → nút theo dõi cạnh `ReportButton`; khu truyện `SectionHeading` + `StoryGrid` + `useMatureAwareList`.

## 4. Trang chủ

- Loader `getHomePage()` (`server-fns/catalog.ts:41`) → core `getHomePage` (`packages/core/src/catalog/home.ts:94-106`) trả `{recent, notable, genres}`, includeMature false.
- Thứ tự: `HomeGenreChips` (:55) → hàng `HomeFeaturedHero` (`pickHero(notable)`, `lib/home.ts`) + `HomeContinueReading` (:56-59) → "Mới cập nhật" `StoryRowList` (:60-71) → `bg-band` "Truyện mới đáng chú ý" `StoryGrid scroll` (:73-86).
- Key: `home_featured_label` = "Mới đáng chú ý" (vi.json:339), `home_notable` :335, `home_notable_subtitle` :343.
- Thanh tab: `components/mobile-tab-bar.tsx`, logic `lib/main-nav.ts` (`MAIN_TABS`, `activeMainTab`).

## 5. Dữ liệu cá nhân phía client

- `lib/api-client.ts` (`createApiClient` từ `@novel-hub/api/client`); ranh giới import kiểm bằng ESLint + `src/lint-boundaries.test.ts`.
- `useMe` (`lib/me.ts`, key `['me']`, staleTime 60 s, chỉ browser); đăng xuất xoá mọi query dưới `['me', ...]` → key cá nhân mới đặt dưới `meQueryKey`.
- Hook TanStack Query ở `src/lib/*.ts`: `library.ts` (`useShelf`, `useSetShelf` optimistic + rollback, `useContinueReading`, `useHistory` infinite cursor), `stories.ts`, `moderation.ts`, `use-mature-aware-list.ts`.
- Trang truyện an toàn CDN: loader không đọc session; `LibraryButton` (`library/library-button.tsx`) render nút trung tính khi SSR/me pending, link đăng nhập cho khách, menu thật sau `useShelf` → **chép mẫu này cho theo dõi, đánh giá, bình luận**.
- 18+: `lib/use-mature-aware-list.ts` gọi lại `api.v1.stories.$get({query})` key `['stories', query]` khi `showMature`; xếp hạng thêm giá trị `list` mới.

## 6. Header

- `components/site-header.tsx:40-49`: icon tìm kiếm mobile, `HeaderNav`, `SiteAccountMenu` → chuông thông báo giữa `HeaderNav` và `SiteAccountMenu` (:47-48), nút ghost icon 42px, hiện cả mobile.
- `components/site-account-menu.tsx`: placeholder 42px khi me pending; menu: Moderation (mod/admin), Write, Library, Settings, Sign out.

## 7. `/write`

- `routes/write/index.tsx:57-104` `WriterStats` (`bg-band rounded-[28px]`, `<dl>` 3 cột: truyện, chương đã đăng, chữ), dữ liệu cộng ở client từ `useMyStories()`. Bọc `WriterGate` (`components/writer-gate.tsx`). Thẻ `components/write/my-story-card.tsx`.
- Không có chart/SVG, không có thư viện chart.

## 8. `/moderation`

- `routes/moderation.tsx`: tab `reports | tags`, filter `TabLinks` trạng thái/lý do (:108-127), `useReports` + `Pagination`.
- `components/moderation/report-card.tsx`, `report-target-context.tsx` (`TargetContext` switch `story|chapter|user|missing` :71-104, export `StoryLine`, `ChapterLine`), `report-actions.ts` (`ACTION_LABELS`, `storyActions`, `userActions`, `canActOn`, `actionsFor` :89-94) + `report-actions.test.ts`.
- Thêm target `comment` chạm: `REPORT_TARGET_TYPES` + `MODERATION_ACTIONS` (`hide_comment`/`restore_comment`); union target của core `ReportDto`; `case 'comment'` trong `TargetContext`; `actionsFor` + `ACTION_LABELS` + message; `ReportButton target={{type:'comment',...}}` (`components/report/report-dialog.tsx`).

## 9. Component

- `ui/` (shadcn new-york): badge, button, checkbox, dialog, dropdown-menu, input, label, select, sheet (adaptive), textarea. **Chưa có**: tabs, popover, tooltip, avatar, radio-group, switch, scroll-area, separator, toast. Tab group = link + `segmented-link-classes.ts`. Cấm sonner.
- Layout: `site-layout.tsx` (`bottomInset`), `page-shell.tsx` (`PageShell`, `PageTitle`, `pageCardClass`), `section-heading.tsx` (`onBand`), `static-page.tsx`, `not-found.tsx`, `auth-ui.tsx` (`FormMessage`).
- Story: `story-card.tsx`, `story-grid.tsx`, `story-row-list.tsx`, `pagination.tsx`, `story-hero.tsx`, `story-meta.tsx`, `story-synopsis.tsx`, `story-chapter-list.tsx`, `story-author-card.tsx`, `story-sticky-cta.tsx`, `story-labels.ts`, `on-cover-classes.ts`; `story-cover.tsx`, `tag-chip.tsx`, `status-badges.tsx`.
- Library, home (`home-featured-hero`, `home-continue-reading`, `home-genre-chips`), report (`report-button`, `report-dialog`, `reason-labels`), moderation (`confirm-dialog`, `merge-tag-form`, `moderation-tab-links`).

## 10. Token

- `src/styles/tokens.css`, `app.css` (`@theme inline`), `reader.css`, `token-values.ts` + `token-contrast-pairs.ts` + `tokens.test.ts`. Đổi màu: sửa cả `tokens.css` và `token-values.ts` + cặp tương phản.
- Một màu nhấn `--primary`; thứ bậc bằng nền; pill; vùng chạm ≥ 44; bóng chỉ hero/dialog; phần tử trùng theo viewport ẩn bằng `display:none`.

## 11. i18n

- `packages/shared/messages/vi.json` (502 dòng), key snake_case `<khu>_<thứ>`, tham số `{name}`; import `m` từ `@novel-hub/shared/messages`. Nhãn map bằng `Record<X, () => string>`.
- Tiền tố mới gợi ý: `comment_`, `follow_`, `notification_`, `rating_`, `ranking_`, `dashboard_`, `badge_`, `contest_`.

## 12. Test

- Playwright `apps/web/playwright.config.ts`: port 3100, `workers:1`, chromium desktop, env `TEST_DATABASE_URL`/`TEST_REDIS_URL`, `QUEUE_PREFIX=e2e`, `RATE_LIMIT_FACTOR=50`, **không chạy worker** (job và outbox không được xử lý).
- 17 spec ở `apps/web/e2e/`. `e2e/global-setup.ts` migrate, truncate, seedTags, xoá index Meili e2e, reset rate limit.
- Helper: `helpers/accounts.ts` (`gotoHydrated`, `signUp`, `signUpVerified` = đăng ký qua UI rồi SQL `email_verified = true`); mod bằng SQL (`moderation.spec.ts:41`); `helpers/content.ts` (`createPublishedStory`, `chapterText`, `allowMatureContent`); `helpers/stories.ts` (`createStory`, `createChapter`, `publishChapterViaApi`); `helpers/search.ts` (`syncSearch`); nhiều user bằng `browser.newContext()`.
- Vitest: project `unit` (node, không jsdom; component test dùng `renderToStaticMarkup` + regex), `integration` (`*.int.test.ts`, chạy tuần tự). `apps/web/src` có 32 file test.
