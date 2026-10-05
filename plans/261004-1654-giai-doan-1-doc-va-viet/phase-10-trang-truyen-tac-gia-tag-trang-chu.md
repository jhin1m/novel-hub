---
phase: 10
title: "Phase 10: Trang truyện, tác giả, tag, trang chủ"
status: pending
priority: P1
effort: "2.5d"
dependencies: [9]
---

# Phase 10: Trang truyện, tác giả, tag, trang chủ

Spec checkbox: `Trang truyện, trang tác giả, trang tag, trang chủ (mới cập nhật, truyện mới đáng chú ý).`

## Context Links

- Spec mục 4 (URL, slug, tag canonical 301), mục 6 (cache), mục 7 (18+ ở danh sách, ban, điều khoản có từ giai đoạn 1), mục 8 (khu khám phá, thẻ truyện, trang truyện như trang sách)
- [plan.md](./plan.md) — "Kiến trúc dữ liệu cho UI", "18+", câu hỏi mở #5, #6
- `plans/reports/researcher-261004-2352-tanstack-start-ssr-ui-report.md` mục 1–3, 8
- Phase 3 (`StoryCover`); phase 7 (`canReadChapter`, `isStoryPubliclyVisible`, `listReadableChapters`, `MatureGate`, `cache-headers`, `assertCanonical`, `canonicalPath`, `getPreferences`, `GET /me` có `preferences`, `docs/deployment-cloudflare.md`); phase 8 (`PATCH /api/v1/me/preferences`, `updatePreferences`); phase 9 (`urlsFor`, job purge, event `user`) <!-- Red Team: tên và số phase theo bản tách 7/8/9 -->
- Schema: `stories` (index `stories_visibility_last_chapter_at_idx` là `DESC NULLS LAST`, `packages/db/drizzle/0000_init.sql:297`), `story_tags`, `tags.canonical_id`

## Overview

- Bốn trang công khai SSR, cache CDN:
  - `/stories/$storyKey`: trang truyện;
  - `/authors/$username`: trang tác giả;
  - `/tags/$tagSlug`: trang tag, phân trang `?page=N`;
  - `/`: trang chủ.
- Thẻ truyện `StoryCard` dùng chung cho mọi danh sách; phase 11 và 12 dùng lại.
- **URL chuẩn:** mọi route công khai gọi `assertCanonical(location, canonicalPath(…))` của phase 7: path không lowercase hoặc có query ngoài allowlist → 301. Allowlist: trang tag chỉ `page` (dạng chuẩn `?page=N`, N > 1, do `canonicalPath({ kind: 'tag', slug, page })` dựng); các trang khác không query. <!-- Red Team: canonical query/case; consistency sweep — dùng assertCanonical + canonicalPath của phase 7 -->
- **Điều hướng giữa trang công khai là link tài liệu thường** (`reloadDocument`), để mọi lượt xem đi qua HTML cache CDN, không gọi server fn qua `/_serverFn/*`. <!-- Red Team: link tài liệu thường -->
- **18+:** HTML SSR của mọi danh sách không chứa truyện 18+; user đã bật thì client tải lại danh sách qua `GET /api/v1/stories` (không cache); trang truyện 18+ dùng lại `MatureGate` của phase 7.
- Trang `/settings`: nhận phần trạng thái tài khoản đang nằm ở trang chủ; bật/tắt 18+ có xác nhận đủ 18 tuổi.
- Trang tĩnh `/terms`, `/content-policy`; header và footer có link.
- Mở rộng `urlsFor` (phase 9) để purge thêm trang chủ, trang tác giả, trang tag (trang 1).

## Key Insights

- **Danh sách công khai** luôn lọc qua `publicStoryWhere({ includeMature })`:
  - `visibility = 'published'`;
  - tác giả `status != 'banned'`. Đây là **cơ chế ban duy nhất** (cùng điều kiện với `canReadChapter` phase 7); phase 15 chỉ đổi status, không ẩn truyện hàng loạt; <!-- Red Team: một cơ chế ban -->
  - `is_mature = false`, trừ khi server tự xác định user đã bật `showMature`. Không bao giờ lấy cờ này từ query.
- "Mới cập nhật" sắp `last_chapter_at DESC NULLS LAST, id DESC`. Viết bằng `sql\`... desc nulls last\``, vì `desc()` của Drizzle sinh NULLS FIRST, không khớp index (`packages/db/src/schema/stories.ts:68-70`). Kiểm `EXPLAIN` một lần.
- **Tag gộp:** URL tag có `canonical_id` → 301 sang tag chuẩn (chuỗi tối đa 3 bước, giữ `page`); trang tag chuẩn liệt kê truyện gắn tag đó **hoặc** tag đã gộp vào nó (`tag_id IN (id, các tag có canonical_id = id)`).
- **Canonical query/case và cache key:** <!-- Red Team: X1 -->
  - mỗi biến thể query hoặc chữ hoa là một cache entry riêng mà purge không chạm tới. Origin trả 301 cho biến thể nên entry đó chỉ chứa redirect, không chứa nội dung cũ;
  - trang tag: `page=1` → 301 bỏ `page`; `page` không phải số nguyên dương thập phân chuẩn (`abc`, `02`, `0`, lặp tham số) → 301 về dạng chuẩn (bỏ hoặc `page=2`); `page` > `totalPages` → 404;
  - `/authors/Abc` → 301 `/authors/abc`; `/tags/Tien-Hiep` → 301; `/?utm_source=x` → 301 `/` (chấp nhận mất utm, năm đầu không có analytics);
  - **bất biến cho Cloudflare:** cache key phải giữ query string. Nếu Cache Rule bỏ qua query trong khi origin 301 theo query, phản hồi 301 sẽ được cache dưới key của URL chuẩn → vòng redirect. Bước 15 kiểm `docs/deployment-cloudflare.md` (phase 7) ghi đúng điều này.
- **Thời gian trong HTML cache:** không dùng thời gian tương đối; hiển thị ngày tuyệt đối `dd/MM/yyyy`, format với `timeZone: 'Asia/Ho_Chi_Minh'` cố định để server và client giống nhau.
- **Tần suất ra chương:** số chương đã đăng trong 30 ngày gần nhất quy ra "x chương/tuần". Ít hơn 2 chương thì không hiện. Tính trong core, không lưu.
- **Cache:**
  - trang truyện: `PUBLIC_CACHE` của phase 7, purge khi đổi;
  - danh sách (chủ, tag, tác giả): `LIST_CACHE` = `public, s-maxage=600, stale-while-revalidate=3600`; purge trang 1 khi có đổi; trang tag `page>1` là cache key riêng (key giữ query), không purge, chỉ dựa TTL (thẻ truyện bị ẩn tồn tại tối đa ~10 phút + một lần revalidate, link dẫn tới 404). <!-- Red Team: giảm SWR danh sách cho khớp chương -->
- **Trang chủ** cache công khai nên trạng thái đăng nhập (`useMe`) chuyển sang `/settings` và menu tài khoản ở header (phase 1). `e2e/auth.spec.ts` phải sửa theo.
- **Mục lục ở trang truyện:** dùng `listReadableChapters` (phase 7), render hết trong SSR; 1000 chương ≈ 60 KB HTML, chấp nhận.
- **Purge không tạo event mới:** event `ContentChange` đã ghi vào outbox `content_events` trong transaction của hàm core ghi nội dung (phase 5 nối vào truyện/chương, phase 15 cho hành động mod) và hook user ở phase 9; worker drain → `jobsForChange` → job purge (phase 9) → `urlsFor`. Phase này chỉ mở rộng `urlsFor`. <!-- Red Team: outbox thay afterContentChanged -->

## Requirements

**Functional**

- **`/stories/{slug}-{publicId}`:**
  - bìa (`StoryCover`), tên, bút danh (link `/authors/...`), tag chính, các tag theo nhóm (thể loại, chủ đề, cảnh báo), trạng thái, số chương, tổng chữ, tần suất ra chương, ngày cập nhật gần nhất, nhãn "Có dùng AI", giới thiệu (plain text, `pre-line`);
  - nút "Đọc từ đầu" (chương đọc được đầu tiên); mục lục chương đã đăng;
  - slug lệch, path chữ hoa hoặc có query → 301; truyện không công khai → 404;
  - truyện 18+: `MatureGate` + `noindex` (meta và `X-Robots-Tag`).
- **`/authors/{username}`:** tên hiển thị, bio, truyện công khai (`StoryCard`); 404 khi user không tồn tại, bị ban, hoặc không có truyện công khai; truyện 18+ ẩn khỏi SSR.
- **`/tags/{tagSlug}?page=N`:** tên tag, loại, 24 truyện/trang, phân trang; tag gộp → 301 giữ `page`; quy tắc `page` như Key Insights.
- **`/`:** "Mới cập nhật" 24 truyện có `last_chapter_at`; "Truyện mới đáng chú ý" 12 truyện: công khai, tạo trong 30 ngày, ≥ 3 chương, ≥ 10.000 chữ, sắp `last_chapter_at` giảm dần; thiếu thì bù truyện công khai mới tạo gần nhất (không trùng); <!-- Updated: Validation Session 1 - tiêu chí đáng chú ý --> danh sách thể loại (tag `genre` chuẩn).
- **`StoryCard`:** bìa 2:3, tên, bút danh, tag chính, số chương, tổng chữ (gọn, `vi-VN`), trạng thái, ngày cập nhật, nhãn AI nếu có.
- **Link:** mọi link tới route công khai (truyện, chương, tác giả, tag, trang chủ, phân trang, trang tĩnh) là `<Link reloadDocument>` (hoặc wrapper phase 7 nếu đã có). Link tới trang cá nhân (`/write`, `/settings`) giữ điều hướng SPA.
- **`GET /api/v1/stories?list=recent|notable|tag|author&tag=&author=&page=`:** session tuỳ chọn; `includeMature` = preferences của user (server đọc qua `getPreferences` phase 7), khách luôn `false`; trả `{ stories: StoryCardDto[], page, totalPages }`, `no-store`.
- **Danh sách khi user đã bật 18+** (`useMe().preferences.showMature`): `useMatureAwareList` gọi API trên và thay danh sách SSR.
- **`/settings`** (client, `no-store`, `noindex`): khách → lời mời đăng nhập; user → trạng thái tài khoản (tên, username, xác thực email + gửi lại, đăng xuất); công tắc "Hiện nội dung 18+": bật → dialog checkbox "Tôi xác nhận đã đủ 18 tuổi" → `PATCH /api/v1/me/preferences`; tắt → gọi ngay và xoá cờ `nh:mature`.
- **`/terms`, `/content-policy`:** nội dung qua Paraglide; Claude viết **bản nháp** theo spec mục 7 (tác giả giữ bản quyền, site được cấp quyền hiển thị miễn phí, kiếm tiền sau này opt-in, nội dung cấm, 18+, báo cáo), đầu trang ghi rõ "bản nháp"; user duyệt trước khi mở public (không chặn checkbox). <!-- Updated: Validation Session 1 - điều khoản Claude viết nháp -->
- **Header:** Trang chủ, Viết (`/write`, khi đã đăng nhập), Cài đặt. **Footer:** điều khoản, quy định nội dung.
- **Purge (`urlsFor` mở rộng):**
  - event chương (đăng/xoá/ẩn/khôi phục) và event truyện: thêm `/`, `/authors/{username}`, `/tags/{slug}` (slug chuẩn của mọi tag của truyện, trang 1);
  - event `user` (đổi tên hiển thị, ban, bỏ ban): thêm `/` và trang 1 các tag của mọi truyện của tác giả (phase 9 đã có trang tác giả + truyện + chương).
- **`head()`:** title, description (đoạn đầu giới thiệu, cắt 160 ký tự), canonical tuyệt đối. Phase 16 bổ sung OG.

**Non-functional**

- Mỗi trang SSR ≤ 3 truy vấn chính; danh sách dùng index có sẵn.
- Không UUID trong HTML/API; DTO chỉ có `publicId`, `slug`, `username`, tag `slug`.
- Không `Set-Cookie` trên trang công khai.

## Architecture

```
routes (loader → server-fns/catalog.ts → core/catalog)       assertCanonical(canonicalPath(…))   headers
  stories.$storyKey.index.tsx  getStoryPage(publicId)         { kind: 'story' }                   PUBLIC_CACHE | NOT_FOUND | 301
  authors.$username.tsx        getAuthorPage(username)        { kind: 'author' }                  LIST_CACHE  | NOT_FOUND | 301
  tags.$tagSlug.tsx            getTagPage({ slug, page })     { kind: 'tag', page } (?page)       LIST_CACHE  | NOT_FOUND | 301
  index.tsx                    getHomePage()                  { kind: 'home' }                    LIST_CACHE  | 301
  settings.tsx                 (client: useMe, PATCH /me/preferences)                             NO_STORE
  terms.tsx, content-policy.tsx                               { kind: 'static' }                  PUBLIC_CACHE
  (301: assertCanonical tự chọn REDIRECT_CACHE khi sai slug/tag, NO_STORE khi chỉ khác chữ hoa/query — như phase 7)
Client: useMatureAwareList(ssrStories, query) ── showMature? ──▶ GET /api/v1/stories (hc, useQuery)
core/catalog
  storyCardColumns + toStoryCard()       ← phase 11 (map doc Meili), 12, 16 dùng lại
  publicStoryWhere({ includeMature })     ← visibility + author không banned + is_mature
outbox content_events ─▶ drain ─▶ jobsForChange ─▶ job purge (phase 9) ─▶ urlsFor + catalogUrls ─▶ Cloudflare
```

```ts
// packages/core/src/catalog/story-card.ts
export interface StoryCardDto {
  publicId: string; slug: string; title: string; coverUrl: string | null;
  author: { username: string; displayName: string };
  mainTag: { slug: string; name: string };
  status: StoryStatus; chapterCount: number; wordCount: number;
  lastChapterAt: string | null; isAiAssisted: boolean; isMature: boolean;
}
export interface ListOptions { includeMature: boolean }
export function publicStoryWhere(o: ListOptions): SQL;
export function listRecentlyUpdated(db, o: ListOptions & { limit: number; page?: number }): Promise<Paged<StoryCardDto>>;
export function listNotable(db, o: ListOptions & { limit: number; now?: Date }): Promise<StoryCardDto[]>;
export function getStoryPage(db, publicId: string, now?: Date): Promise<StoryPageData | null>;
export function getAuthorPage(db, username: string, o: ListOptions): Promise<AuthorPageData | null>;
export function getTagPage(db, slug: string, o: ListOptions & { page: number }):
  Promise<{ kind: 'redirect'; slug: string } | { kind: 'ok'; tag; stories: Paged<StoryCardDto> } | null>;
export function chaptersPerWeek(publishedAts: Date[], now: Date): number | null;
export function catalogUrls(db, change: ContentChange): Promise<string[]>; // path tương đối dựng bằng canonicalPath (phase 7); urlsFor ghép APP_URL

// packages/shared/src/schemas/catalog.ts
export const storyListQuery = z.discriminatedUnion('list', [...]);   // validate('query') và client
export const CATALOG_PAGE_SIZE = 24;
export function canonicalPageParam(raw: string[]): { page: number; canonical: string | null }; // null = bỏ `page`
```

## File Inventory

| File | Action | Ghi chú |
|---|---|---|
| `packages/shared/src/schemas/catalog.ts` (+ test) | create | `storyListQuery`, `canonicalPageParam`, `CATALOG_PAGE_SIZE` |
| `packages/core/src/catalog/*.ts` | create | `story-card.ts`, `story-page.ts`, `author-page.ts`, `tag-page.ts`, `home.ts`, `frequency.ts`, `urls.ts` (`catalogUrls`) |
| `packages/core/src/catalog/*.test.ts`, `*.int.test.ts` | create | unit `chaptersPerWeek`, `toStoryCard`; int lọc 18+/ban/draft, canonical tag, phân trang, `catalogUrls` |
| `packages/core/src/cdn/urls-for.ts` (phase 9) | modify | gọi `catalogUrls` |
| `packages/core/src/index.ts` | modify | export |
| `packages/api/src/routes/stories.ts` (phase 2) | modify | thêm `GET /` (danh sách, session tuỳ chọn) |
| `packages/api/src/routes/stories.test.ts` | modify | kịch bản 18+, dựng app bằng `makeTestApiDeps` |
| `apps/web/src/server-fns/catalog.ts` | create | 4 server fn GET |
| `apps/web/src/lib/cache-headers.ts` (phase 7) | modify | thêm `LIST_CACHE` |
| `apps/web/src/lib/format.ts` (+ test) | create | `formatWordCount`, `formatDate` (vi-VN, Asia/Ho_Chi_Minh) |
| `apps/web/src/lib/use-mature-aware-list.ts` | create | |
| `apps/web/src/components/story/story-card.tsx`, `story-grid.tsx`, `pagination.tsx`, `chapter-list.tsx`, `story-meta.tsx` | create | link `reloadDocument` |
| `apps/web/src/routes/stories.$storyKey.index.tsx` | create | tên file theo cấu trúc route phase 7 |
| `apps/web/src/routes/authors.$username.tsx`, `tags.$tagSlug.tsx` | create | |
| `apps/web/src/routes/index.tsx` | modify | trang chủ thật |
| `apps/web/src/routes/settings.tsx` | create | nhận `AccountStatus` từ trang chủ |
| `apps/web/src/routes/terms.tsx`, `content-policy.tsx` | create | |
| `apps/web/src/components/site-layout.tsx` (phase 1) | modify | link header/footer |
| `docs/deployment-cloudflare.md` (phase 7) | modify | chỉ khi chưa ghi: cache key giữ query string; danh sách route công khai thêm `/`, `/authors/*`, `/tags/*`, trang tĩnh |
| `packages/shared/messages/vi.json` | modify | key `story_*`, `author_*`, `tag_*`, `home_*`, `settings_*`, `terms_*`, `rules_*` |
| `apps/web/e2e/catalog.spec.ts` | create | |
| `apps/web/e2e/auth.spec.ts` | modify | trạng thái đăng nhập ở chỗ mới |

## Implementation Steps

1. **Shared:** `storyListQuery` (tag/author validate slug/username regex), `CATALOG_PAGE_SIZE`, `canonicalPageParam` (nhận mọi giá trị `page` của URL; trả trang dùng và dạng chuẩn). Unit test `1`, `02`, `abc`, `0`, lặp tham số, `1001`.
2. **Core `story-card.ts`:** `storyCardColumns` (join `users`, tag chính), `toStoryCard` (Date → ISO); `publicStoryWhere` cùng điều kiện với `isStoryPubliclyVisible` (phase 7). Unit test hai hàm cho cùng kết quả trên bảng tổ hợp visibility × author status × is_mature.
3. **Core `frequency.ts`:** `chaptersPerWeek(dates, now)` = số chương trong 30 ngày × 7 / 30, làm tròn 1 chữ số; < 2 chương → `null`.
4. **Core `story-page.ts`:** truyện + tác giả + mọi tag (quy về canonical, bỏ trùng) + `listReadableChapters`; `published_at` 30 ngày cho tần suất; `firstChapterNumber`; không công khai → `null`.
5. **Core `author-page.ts`, `tag-page.ts`, `home.ts`:** phân trang offset (`limit/offset` + `count(*)` cùng điều kiện); `getTagPage` xử lý canonical (≤ 3 bước, gặp vòng thì `null`); `listNotable` theo công thức chốt ở #5.
6. **Core `urls.ts`:** `catalogUrls(db, change)` theo bảng Purge ở Requirements; đọc trạng thái hiện tại (không lọc visibility, để truyện vừa ẩn hoặc tác giả vừa bị ban vẫn ra URL danh sách cần purge). Nối vào `urlsFor` của phase 9.
7. **Int test core** trên dữ liệu tự tạo: draft, hidden_by_mod, 18+, tác giả banned không có trong danh sách; `includeMature: true` có 18+; tag gộp ra redirect, trang chuẩn gồm truyện gắn tag cũ; thứ tự NULLS LAST; `catalogUrls` cho event chương, truyện ẩn, user banned.
8. **API `GET /api/v1/stories`:** chain trong `stories.ts`, `sessionMiddleware` (không `requireAuth`), `validate('query', storyListQuery)` (phase 2); `includeMature = user ? prefs.showMature : false`; lỗi qua `coreError()`. Test dựng app bằng `makeTestApiDeps`.
9. **Server fn `catalog.ts`:** 4 hàm GET + `inputValidator`; trả kèm `appUrl` cho canonical.
10. **Route + `headers()`:**
    - trong loader, sau khi có dữ liệu (slug hiện tại, tag chuẩn), gọi `assertCanonical(location, canonicalPath(…))` như phase 7 theo bảng Architecture; trang tag dùng `canonicalPageParam` để lấy `page` rồi đưa vào `canonicalPath({ kind: 'tag', slug, page })`;
    - 301 do `assertCanonical` ném (tự chọn `REDIRECT_CACHE`/`NO_STORE`); tag gộp sang slug khác → `REDIRECT_CACHE`; `notFoundComponent` dùng chung phase 7;
    - `loaderDeps: ({ search }) => ({ page: search.page })` cho trang tag; trang truyện 18+ thêm `X-Robots-Tag: noindex`.
11. **Component:** `StoryCard` (dùng `StoryCover`), `StoryGrid` (2 cột mobile → 4–6 desktop), `Pagination` (`Link reloadDocument` có `search`), `ChapterList`, `StoryMeta`. `formatWordCount` dùng `Intl.NumberFormat('vi-VN', { notation: 'compact' })`, kiểm output trên Node 24 bằng unit test.
12. **`useMatureAwareList`:** nhận `ssrStories` + `query`; nếu `showMature` thì `useQuery(['stories', query])` → hc; trong lúc tải vẫn hiện SSR; lỗi thì giữ SSR.
13. **`/settings`:** chuyển `AccountStatus` từ `index.tsx` sang (giữ text i18n cũ); công tắc 18+ dùng `Dialog` + `Checkbox` phase 1; sau `PATCH` thì `setQueryData(meQueryKey)` và cập nhật cờ `nh:mature`.
14. **Trang tĩnh + header/footer:** layout prose, từng đoạn một key Paraglide; chưa có nội dung chốt thì không merge nội dung bịa (#6). Sửa `SiteLayout`; link tìm kiếm và tủ truyện do phase 11, 12 thêm.
15. **Cloudflare doc:** đọc `docs/deployment-cloudflare.md` (phase 7); bổ sung route công khai của phase này và bất biến "cache key giữ query string" nếu chưa có. Không đổi cấu hình Cloudflare thật (áp lúc deploy).
16. **E2E `catalog.spec.ts`:** dữ liệu qua helper core (2 truyện thường, 1 truyện 18+, 1 tag gộp, 1 truyện draft); kiểm header bằng `request.get(url, { maxRedirects: 0 })`; sửa `auth.spec.ts`.
17. **Gate:** `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e`. Đánh `[x]` checkbox "Trang truyện, trang tác giả, trang tag, trang chủ (mới cập nhật, truyện mới đáng chú ý)." trong spec.

## Function / Interface Checklist

- [ ] `StoryCardDto`, `storyCardColumns`, `toStoryCard`, `publicStoryWhere`
- [ ] `chaptersPerWeek`, `canonicalPageParam`
- [ ] `getStoryPage`, `getAuthorPage`, `getTagPage`, `listRecentlyUpdated`, `listNotable`, `getHomePage`
- [ ] server fn `getStoryPage`, `getAuthorPage`, `getTagPage`, `getHomePage`
- [ ] `GET /api/v1/stories`
- [ ] `useMatureAwareList`, `formatWordCount`, `formatDate`
- [ ] `StoryCard`, `StoryGrid`, `Pagination`, `ChapterList`, `StoryMeta`
- [ ] `catalogUrls` nối vào `urlsFor`

## Test Scenario Matrix

| Mức | Kịch bản | Loại |
|---|---|---|
| Critical | SSR trang chủ/tag/tác giả không chứa truyện 18+, draft, hidden_by_mod, tác giả banned | int (core) + e2e (HTML) |
| Critical | Trang truyện/tag/tác giả/chủ có `cache-control: public, s-maxage=…`, không `set-cookie` | e2e |
| Critical | Slug truyện sai → 301; truyện draft → 404 | e2e |
| Critical | `/stories/Kiem-Dao-K7M2XQ9P`, `/authors/ABC`, `/?x=1`, `/stories/...?ref=a` → 301 về URL chuẩn | e2e |
| Critical | Tag: `?page=1` → 301 bỏ `page`; `?page=02` → 301 `?page=2`; `?page=abc`/`?foo=1` → 301; trang vượt → 404 | unit (`canonicalPageParam`) + e2e |
| Critical | Tag gộp `/tags/tu-tien?page=2` → 301 `/tags/tien-hiep?page=2`; trang chuẩn có truyện gắn tag cũ | int + e2e |
| High | Link từ trang chủ sang trang truyện, phân trang tag là điều hướng tài liệu (không có request `/_serverFn/`) | e2e |
| High | User bật 18+ ở `/settings` (phải tick xác nhận) → trang chủ hiện thêm truyện 18+ sau khi tải client | e2e |
| High | `GET /api/v1/stories?list=recent` khách → không có 18+ dù gửi `includeMature=true` | unit (api) |
| High | Trang truyện 18+: khách thấy màn cảnh báo, HTML có `noindex` | e2e |
| High | Thứ tự "Mới cập nhật" đúng `desc nulls last`; truyện chưa có chương không xuất hiện | int |
| High | `catalogUrls`: event đăng chương gồm `/`, trang tác giả, trang tag chuẩn; truyện bị ẩn và user bị ban vẫn ra đủ URL | int |
| Medium | `chaptersPerWeek`: 0, 1, 8 chương/30 ngày | unit |
| Medium | `formatDate` cùng output ở server và trình duyệt (không hydration warning) | e2e |
| Medium | Luồng auth cũ vẫn xanh với chỗ hiển thị mới | e2e (`auth.spec.ts`) |

## Dependency Map

- **Cần:**
  - phase 1: `SiteLayout`, component;
  - phase 2: `parseStoryKey`, `stories` sub-app, `tags`, `validate()`, `coreError()`, `makeTestApiDeps`;
  - phase 3: `StoryCover`;
  - phase 5: outbox `content_events`, `ContentChange`, `jobsForChange`;
  - phase 7: access, `listReadableChapters`, `MatureGate`, `cache-headers`, `assertCanonical`, `canonicalPath`, `getPreferences`, `docs/deployment-cloudflare.md`;
  - phase 8: `PATCH /api/v1/me/preferences` (`updatePreferences`);
  - phase 9: `urlsFor`, job purge, event `user`.
- **Phase sau dùng:**
  - phase 11: `StoryCardDto`, `storyCardColumns`, `publicStoryWhere`, `StoryCard`, `StoryGrid`, header;
  - phase 12: trang truyện (nút tủ truyện, đọc tiếp), `StoryCard`, `publicStoryWhere`;
  - phase 15: nút báo cáo ở trang truyện và tác giả; ban dựa vào `publicStoryWhere`;
  - phase 16: `head()` và sitemap dùng `publicStoryWhere`.

## Success Criteria

- [ ] Bốn trang công khai SSR đúng nội dung spec mục 8, cache công khai, 301/404 đúng
- [ ] Mọi biến thể query/chữ hoa ngoài allowlist trả 301; link giữa trang công khai là điều hướng tài liệu
- [ ] Không truyện 18+ trong HTML danh sách; user đã bật thấy thêm qua API
- [ ] `/settings` bật 18+ có xác nhận; trang điều khoản và quy định có mặt
- [ ] Purge gồm trang danh sách liên quan, kể cả khi truyện bị ẩn hoặc tác giả bị ban
- [ ] Gate 5 lệnh xanh; checkbox spec = `[x]`

## Risk Assessment

| Rủi ro | Khả năng × Ảnh hưởng | Giảm thiểu |
|---|---|---|
| Lệch điều kiện "công khai" giữa trang đọc và danh sách | Trung bình × Cao | Một nguồn: `publicStoryWhere` và `isStoryPubliclyVisible` có test đối chiếu |
| Cache Rule bỏ qua query + origin 301 → vòng redirect | Thấp × Cao | Bất biến ghi trong `docs/deployment-cloudflare.md`; kiểm lúc deploy |
| Biến thể URL giữ nội dung cũ sau khi ẩn | Thấp × Cao | 301 mọi biến thể; danh sách SWR 1 giờ |
| Hydration mismatch do format ngày/số | Trung bình × Trung bình | Locale và timezone cố định; không thời gian tương đối |
| Mục lục rất dài làm nặng trang truyện | Thấp × Trung bình | Đo 1000 chương; vượt ~100 KB thì phân trang mục lục |
| Truyện 18+ lọt vào HTML cache | Thấp × Cao | Core mặc định `includeMature: false`; server fn không nhận tham số này |
| `reloadDocument` làm điều hướng chậm hơn SPA | Trung bình × Thấp | Chấp nhận: HTML từ CDN nhanh; trang cá nhân vẫn SPA |
| Đổi trang chủ làm vỡ e2e auth | Cao × Thấp | Sửa `auth.spec.ts` trong cùng phase |
| Nội dung pháp lý chưa được duyệt khi mở public | Trung bình × Trung bình | Bản nháp đánh dấu rõ; nhắc user duyệt trước khi mở public |

Rollback: không migration; trả `index.tsx` về bản cũ, gỡ route mới và `catalogUrls` là về trạng thái phase 9.

## Security Considerations

- `includeMature` chỉ suy ra từ preferences server đọc; query string không có tham số này.
- Giới thiệu truyện, bio là plain text, React escape; không `dangerouslySetInnerHTML`.
- `GET /api/v1/stories` `no-store`, không trả UUID hay email.
- Trang tác giả 404 cho user bị ban (spec mục 7: nội dung bị ẩn); dựa vào `publicStoryWhere`, không phụ thuộc việc ẩn từng truyện.
- 301 canonical chặn việc tạo cache entry tuỳ ý chứa nội dung (cache poisoning bằng query rác).

## Câu hỏi mở (đã chốt — Validation Session 1, 2026-10-05)

1. "Truyện mới đáng chú ý": truyện công khai tạo trong 30 ngày, ≥ 3 chương, ≥ 10.000 chữ; sắp `last_chapter_at` mới nhất, lấy 12; thiếu thì bù truyện công khai mới tạo gần nhất. Giai đoạn 2 thay bằng tăng trưởng lượt đọc.
2. `/terms`, `/content-policy`: Claude viết nháp theo spec mục 7, user duyệt trước khi mở public.
3. Trang tác giả cho user chưa có truyện công khai: 404.

## Next Steps

Phase 11: tìm kiếm Meilisearch (dùng lại `StoryCardDto`, `StoryCard`, thêm link tìm kiếm vào header).
