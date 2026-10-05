# Cook phase 10: trang truyện, tác giả, tag, trang chủ

Plan: `plans/261004-1654-giai-doan-1-doc-va-viet/phase-10-trang-truyen-tac-gia-tag-trang-chu.md`. Ngày 2026-10-05.

## Đã làm

- **Shared** `packages/shared/src/schemas/catalog.ts`: `CATALOG_PAGE_SIZE` (24), `NOTABLE_LIMIT` (12), `canonicalPageParam` (`02`→2, `abc`/`0`/thiếu→1, lặp→giá trị đầu), `storyListQuery` (union `recent|notable|tag|author`, không có tham số 18+), `usernameParamSchema` (định dạng username, không chặn tên dành riêng).
- **Core** `packages/core/src/catalog/`:
  - `story-card.ts`: `StoryCardDto`, `storyCardColumns`, `selectStoryCards`, `toStoryCard`, `publicStoryWhere` (published + tác giả không banned + `is_mature=false` trừ khi `includeMature`), thứ tự `last_chapter_at desc nulls last, id desc` (EXPLAIN: dùng `stories_visibility_last_chapter_at_idx`, incremental sort).
  - `frequency.ts` `chaptersPerWeek`; `story-page.ts` `getStoryPage` (tag quy về canonical, bỏ trùng, mục lục `listReadableChapters`); `home.ts` `listRecentlyUpdated`, `listNotable` (≤30 ngày, ≥3 chương, ≥10.000 chữ; bù truyện mới nhất), `listGenres`, `getHomePage`; `tag-page.ts` `getTagPage` (redirect theo chuỗi gộp ≤3 bước, vòng → null; liệt kê cả tag đã gộp vào); `author-page.ts` (404 khi không tồn tại/banned/không có truyện công khai; tác giả chỉ có truyện 18+ vẫn có trang); `lists.ts` `listStories` (cho API); `urls.ts` `catalogUrls`.
  - `cdn/urls-for.ts`: gộp `catalogUrls` (trang chủ, trang tác giả, trang 1 tag chuẩn) sau URL của nội dung.
- **API** `GET /api/v1/stories` trong `packages/api/src/routes/stories.ts`: session tuỳ chọn, `includeMature` chỉ từ `getPreferences`, `no-store`, 404 tag/tác giả không có trang, 400 query sai.
- **Web**:
  - server fn `apps/web/src/server-fns/catalog.ts` (luôn `includeMature: false`).
  - route `stories.$storyKey.index.tsx`, `authors.$username.tsx`, `tags.$tagSlug.tsx`, `index.tsx` (trang chủ thật), `settings.tsx`, `terms.tsx`, `content-policy.tsx`; mọi route công khai gọi `assertCanonical(canonicalPath(…))`; tag gộp → 301 `REDIRECT_CACHE` giữ `page`; trang vượt → 404.
  - `LIST_CACHE` (`public, s-maxage=600, stale-while-revalidate=3600`) cho trang chủ/tag/tác giả; trang truyện và trang tĩnh `PUBLIC_CACHE`; `/settings` `no-store` + noindex; truyện 18+ `noindex` (meta + `X-Robots-Tag`) + `MatureGate`.
  - component `components/story/` (`StoryCard`, `StoryGrid`, `Pagination`, `StoryChapterList`, `StoryMeta`, nhãn trạng thái/loại tag), `static-page.tsx`; `lib/format.ts` (`formatWordCount` tự viết `nghìn/triệu` thay vì compact ICU để server/client giống nhau, `formatDate` `dd/MM/yyyy` Asia/Ho_Chi_Minh), `lib/meta-description.ts`, `lib/use-mature-aware-list.ts`.
  - header: Cài đặt (luôn), Viết truyện (chỉ khi đăng nhập); footer: Điều khoản, Quy định nội dung. Link giữa trang công khai là `<a href>` thường (điều hướng tài liệu).
  - i18n: key `format_*`, `layout_*`, `story_card_*`, `story_page_*`, `author_page_*`, `tag_page_*`, `pagination_*`, `home_*`, `settings_*`, `static_draft_notice`, `terms_*`, `rules_*`. Điều khoản/quy định là **bản nháp**, đầu trang ghi rõ.
- **Docs** `docs/deployment-cloudflare.md`: bảng header theo loại trang, 301 tag gộp, quy tắc `page`, purge danh sách.

## Lệch plan

- Component mục lục đặt tên `StoryChapterList` (`components/story/story-chapter-list.tsx`) thay vì `ChapterList` để không trùng `components/chapter-list.tsx` của khu viết.
- `canonicalPageParam` trả `number` (không trả `canonical`): dạng chuẩn do `canonicalPath({ kind: 'tag', page })` dựng, `assertCanonical` so khớp.
- Link công khai dùng `<a href>` (như trang đọc phase 7) thay vì `<Link reloadDocument>`.
- `formatWordCount` không dùng `Intl` `notation: 'compact'` (output `12 N` khó đọc, phụ thuộc ICU); dùng `Intl.NumberFormat('vi-VN')` + chữ "nghìn/triệu" qua Paraglide.
- Sửa ngoài phạm vi: `useSignOut` (`apps/web/src/lib/me.ts`) chỉ xoá query con của `['me']` rồi đặt `['me']` = null. Trước đây xoá cả `['me']` làm `useMe()` ở component cha không re-render (trang `/settings` vẫn hiện tài khoản sau khi đăng xuất). Lỗi tiềm ẩn từ trước, lộ ra khi đưa trạng thái tài khoản sang `/settings`.
- Tên test tiếng Việt trong `e2e/auth.spec.ts` dịch sang tiếng Anh (file bị sửa trong phase này, theo code-standards).

## Test

- Unit: `catalog.test.ts` (shared), `frequency.test.ts`, `format.test.ts`, `meta-description.test.ts`, `cache-headers.test.ts`.
- Int: `packages/core/src/catalog/catalog.int.test.ts` (đối chiếu `publicStoryWhere` với `isStoryPubliclyVisible` trên 18 tổ hợp, thứ tự nulls last, 18+/draft/hidden/banned, tag gộp + phân trang + vòng gộp, trang tác giả, trang truyện, `catalogUrls` cho truyện ẩn/tác giả bị ban); `story-lists.int.test.ts` (API: khách gửi `includeMature=true` vẫn không có 18+); cập nhật `urls-for.int.test.ts`, `purge-urls.int.test.ts`.
- E2E: `apps/web/e2e/catalog.spec.ts` (cache header, không `set-cookie`, không 18+/draft trong HTML, 12 biến thể 301, 404, không request `/_serverFn/` khi điều hướng, không hydration warning, cảnh báo 18+ + noindex, bật/tắt 18+ ở `/settings`, trang tĩnh + footer); sửa `auth.spec.ts`.

Gate: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e` xanh sau khi sửa review (unit 410, int 211 + 1 skip S3, e2e 47). EXPLAIN "mới cập nhật": dùng `stories_visibility_last_chapter_at_idx` + incremental sort theo `id`.

## Review

`code-reviewer-261005-1440-phase-10-catalog-pages-review-report.md`: 8/10, 0 Critical/High.

- **M1 (đã sửa):** người bật 18+ thấy link tới trang tag cuối mà server 404. `getTagPage` đếm một lần cả hai số (có/không 18+), trả `lastPage` (gồm 18+); route chỉ 404 khi `page > lastPage`. Trang chỉ có truyện 18+ là trang rỗng trong HTML cache, client lấp đầy. Int test mới.
- **M2 (đã sửa):** đổi tag làm purge bỏ sót trang tag truyện vừa rời. Event `story` thêm `previousTagSlugs` (`updateStory` đọc tag cũ trước khi thay, `contentChangeSchema` nhận thêm trường), `catalogUrls` purge cả tag cũ. Int test qua outbox.
- **L2 (đã sửa):** trang chủ không còn đếm tổng "mới cập nhật". **L3 (đã sửa):** trang tag, tác giả, "đáng chú ý" chỉ lấy truyện có `last_chapter_at`. **L4 (một phần):** trang tag có meta description; canonical/description cho `/terms`, `/content-policy` để phase 16 (SEO).
- **Không sửa:** L1 (chuỗi gộp tag nhiều bước chỉ quy 1 bước ở thẻ/purge; phase 15 nên làm phẳng chuỗi khi gộp), L5 (nội dung nháp điều khoản nhắc tính năng phase sau, user duyệt), L6 (đăng nhập xong điều hướng SPA về `/` dùng server fn, chấp nhận), L7 (e2e chạy 1 worker nên không bị đẩy khỏi 24 truyện đầu), L8 (ghi nhận).

## Còn mở

- User duyệt bản nháp `/terms`, `/content-policy` trước khi mở public.
- Cloudflare Cache Rule chưa áp (lúc deploy), `CF_*` trống ở dev nên purge danh sách chưa thử với Cloudflare thật.
