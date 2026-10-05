# Code review: Phase 10, trang truyện / tác giả / tag / trang chủ

Ngày: 2026-10-05. Phạm vi: diff chưa commit và file untracked của phase 10 (`plans/261004-1654-giai-doan-1-doc-va-viet/phase-10-trang-truyen-tac-gia-tag-trang-chu.md`).

## Scope

- Đã sửa 16 file (+504/-180), thêm khoảng 2.470 LOC mới (core catalog, shared schema, route, component, test).
- Đã tự kiểm lại: `pnpm typecheck` OK; `pnpm test` có 68 file và 410 test, tất cả pass. Phần int/e2e chưa chạy lại, lấy theo báo cáo của lead.
- Scout đã kiểm các điểm chạm: `urlsFor` (worker purge, CLI `cdn:purge`), `updateStory` (xoá rồi chèn lại `story_tags`), `useSignOut`/`resetQueries` ở sign-in, `assertCanonical`, Cache Rule trong doc, các `navigate`/`Link` tới route công khai.

## Overall

Chất lượng tốt. Một nguồn `publicStoryWhere` có int test đối chiếu với `isStoryPubliclyVisible`. SSR không bao giờ nhận `includeMature` (bị hardcode `SSR_LISTS`). Mọi URL công khai đều đi qua `canonicalPath`, và route dùng `publicPageHeaders(match.status)` (không dựa vào `loaderData`), nên tránh được bẫy 500 bị cache. Không có UUID trong DTO hay HTML. Link giữa các trang công khai là `<a>` hoặc `Link reloadDocument`. Không thấy lỗi Critical hay High. Có hai lỗi Medium là lỗi logic thật, xem bên dưới.

## Critical

Không có.

## High

Không có.

## Medium

### M1. Người đọc đã bật 18+ bị dẫn tới 404 ở các trang tag cuối

- `apps/web/src/routes/tags.$tagSlug.tsx:75-79` lấy `Pagination` từ `list.totalPages`, còn `list` là kết quả API có tính truyện 18+.
- `apps/web/src/routes/tags.$tagSlug.tsx:33` chặn `page > result.stories.totalPages`, nhưng `totalPages` ở đây là số trang SSR, luôn tính với `includeMature: false`.
- Kịch bản: tag có 80 truyện thường và 20 truyện 18+. SSR có 4 trang, API (đã bật 18+) có 5 trang. Ở trang 4, người đọc thấy nút "Trang sau" trỏ tới `?page=5`. Origin trả 404, và 404 này còn bị CDN cache 60 giây. Mở link trực tiếp `?page=5` cũng ra 404.
- Hướng sửa (chọn một):
  - Phân trang luôn theo số trang SSR, còn danh sách 18+ chỉ là bổ sung (đơn giản nhất).
  - Hoặc khi `page > totalPages` thì render khung rỗng có `NOT_FOUND_CACHE`, để client tải danh sách qua API.
- Cần thêm một e2e: bật 18+, tag có đủ truyện, link trang cuối không ra 404.

### M2. Purge bỏ sót trang tag mà truyện vừa rời đi, nên truyện 18+ có thể nằm lại trong HTML danh sách đã cache

- `packages/core/src/catalog/urls.ts:55-63` đọc tag **hiện tại** của truyện.
- `packages/core/src/stories/update-story.ts:46-49` xoá rồi chèn lại `story_tags` trong cùng transaction. Event `story/updated` không mang theo tag cũ (`content/hooks.ts:9-16` chỉ có `previousSlug`).
- Kịch bản: tác giả đổi tag chính từ `tien-hiep` sang `huyen-huyen`, đồng thời bật `isMature`. `/tags/tien-hiep` không được purge, nên thẻ truyện, giờ đã là 18+, vẫn nằm trong HTML công khai tới hết `s-maxage=600` (cộng thêm cửa sổ SWR). Như vậy là vi phạm bất biến "HTML danh sách không chứa 18+" (spec mục 7). Không có 18+ thì cũng vẫn hiện tag chính sai hoặc truyện sai tag trong khoảng đó.
- Hướng sửa: thêm `previousTagSlugs?: string[]` vào event `story` (giống `previousSlug`, kèm schema Zod). `updateStory` ghi các slug canonical cũ khi tag đổi, `catalogUrls` hợp nhất chúng vào. Thêm int test cho trường hợp đổi tag.

## Low

### L1. Chuỗi tag gộp nhiều bước chỉ được quy về canonical một bước

- Các chỗ dùng `coalesce(canonical, tag)` một bước:
  - `catalog/urls.ts:57-60`
  - `catalog/story-page.ts:84-86, 56-57`
  - `catalog/story-card.ts:52-53`
- Trong khi đó `getTagPage` theo chuỗi tới 3 bước (`tag-page.ts:92-115`).
- Kịch bản: chuỗi a→b→c. Purge chạm `/tags/b` (trang chỉ chứa 301), còn `/tags/c` trang 1 thì không. Thẻ truyện cũng hiện tag chính `b`.
- Phase 15 (gộp tag) phải hoặc làm phẳng chuỗi khi gộp, hoặc đổi các chỗ trên sang resolve nhiều bước. Nên ghi chú ngay bây giờ.

### L2. Số truy vấn vượt NFR "≤ 3 truy vấn chính"

- Trang tag cần 4 truy vấn: tag, toàn bộ tag đã gộp, rows, count.
- Trang chủ cần 4–5 truy vấn. `getHomePage` chạy `count(*)` của "Mới cập nhật" nhưng bỏ `totalPages` (`home.ts:30-37, 96`).
- Hướng sửa: cho phép `listRecentlyUpdated` bỏ qua phần đếm.

### L3. Truyện `published` không còn chương đọc được vẫn xuất hiện

- Truyện như vậy (mọi chương bị ẩn hoặc xoá mềm) vẫn xuất hiện ở trang tag, trang tác giả và phần bù của "đáng chú ý". Ba danh sách này không lọc `last_chapter_at`/`chapter_count > 0` như "Mới cập nhật" (`tag-page.ts:61-69`, `author-page.ts:41-43`, `home.ts:66-69`).
- Trang truyện của chúng không có nút "Đọc từ đầu". Cần chốt đây là chủ đích hay không.

### L4. Thiếu meta description ở trang tag và trang tĩnh

- `head()` của trang tag không có meta description (`tags.$tagSlug.tsx:37-52`).
- `/terms` và `/content-policy` không có canonical lẫn description.
- Phase 16 có thể bổ sung, nhưng plan yêu cầu description cho trang tag ngay ở phase này.

### L5. Bản nháp điều khoản mô tả tính năng chưa có

- `rules_copyright_body` nói "Hệ thống tự kiểm tra trùng lặp", `rules_report_body` hướng dẫn "hãy báo cáo". Cả hai tính năng đều thuộc checkbox sau.
- `rules_mature_body` nói 18+ "chỉ hiện với người đã đăng nhập", trong khi HTML trang truyện 18+ vẫn trả cho khách (cổng chặn ở client).
- Là bản nháp nên không chặn, nhưng cần ghi vào danh sách user duyệt trước khi mở public.

### L6. Sign-in/sign-up vẫn điều hướng SPA về trang chủ

- `sign-in.tsx:36` và `sign-up.tsx:38` dùng `navigate({ to: '/' })`, nên trang chủ được tải qua `/_serverFn/` thay vì HTML từ CDN.
- Không sai về dữ liệu, chỉ lệch khỏi quy ước link tài liệu. Có thể dùng `window.location.assign('/')`.

### L7. Rủi ro e2e flaky

- `catalog.spec.ts:32-38` giả định `normal` nằm trong top 24 của `/` và `/tags/tien-hiep` trang 1.
- Nếu Playwright chạy song song nhiều worker cùng tạo truyện `tien-hiep` có chương sau `beforeAll`, `normal` có thể bị đẩy khỏi trang 1.
- Hiện số truyện tạo mỗi lượt nhỏ nên rủi ro thấp.

### L8. Ghi chú thêm

- `canonicalPageParam` trả `number`, không phải `{ page, canonical }` như interface trong plan. Lệch có chủ đích, chấp nhận được vì canonical do `canonicalPath` dựng.
- Header chỉ có logo làm link "Trang chủ", không có mục nav riêng. Plan ghi "Trang chủ, Viết, Cài đặt".
- Mỗi lần sửa chương đã đăng giờ purge cả `/`, trang tác giả và các trang tag. Ổn ở quy mô năm đầu, nhưng tỷ lệ purge trang chủ sẽ tăng theo số tác giả hoạt động.

## Kiểm theo yêu cầu

**(a) Tiêu chí của phase**

- Bốn trang SSR, 301/404, header cache, `/settings` có dialog xác nhận, trang tĩnh đánh dấu "Bản nháp", link ở header/footer, API `GET /api/v1/stories`, `catalogUrls` đã nối vào `urlsFor`: đều đạt.
- Chưa đạt:
  - Checkbox trong spec (dòng 160) chưa `[x]`, đúng vì còn chờ e2e.
  - Chưa có ghi nhận đã chạy `EXPLAIN` cho thứ tự `desc nulls last`.

**(b) Regression ở các điểm chạm**

- Không thấy regression.
- Worker purge test đã cập nhật thứ tự (URL nội dung trước, danh sách sau, có dedupe).
- `useSignOut`:
  - Thay đổi đúng: `removeQueries` kèm `predicate` chỉ xoá các key con của `['me']`, còn `setQueryData(['me'], null)` vẫn thông báo cho observer đang gắn vào query đó.
  - `sign-in.tsx:35` `resetQueries(['me'])` vẫn reset theo prefix.
  - Cache `['stories', …]` không bị xoá khi đăng xuất, nhưng nhờ cổng `allowed` nên vô hại.
- Header: `/write` chỉ hiện sau khi hydrate và đã đăng nhập; e2e auth đã sửa theo.
- CLI `cdn:purge --story` (`storyUrlsByPublicId`) không purge trang danh sách, ghi chú để biết.

**(c) Hợp đồng công khai**

- Chỉ mở rộng. `stories` sub-app thêm `GET /` trong cùng chain và vẫn giữ `sessionMiddleware`.
- Core và shared chỉ thêm export.
- `no-store` đến từ middleware `noStore` của app.

**(d) Code standards**

- Code, test và comment đều bằng tiếng Anh; tiếng Việt chỉ nằm trong `vi.json` và docs.
- URL dựng bằng `canonicalPath`.
- Không có UUID: `toStoryCard` bỏ `id`, int test có kiểm.
- Route công khai không đọc session hay cookie; e2e kiểm không có `set-cookie`.

**(e) 18+, ban, cache, canonical, hydration**

- 18+ và ban:
  - SSR luôn gọi `includeMature: false`.
  - API suy ra 18+ từ `getPreferences` và Zod bỏ `includeMature` client gửi lên (có test).
  - Ban đi qua `publicStoryWhere`, và trang tác giả bị ban trả 404.
- Header cache:
  - Danh sách: `LIST_CACHE`.
  - Trang truyện và trang tĩnh: `PUBLIC_CACHE`.
  - Truyện 18+: thêm `X-Robots-Tag` cùng meta robots.
  - `/settings`: `NO_STORE` + noindex.
- Canonical trang tag:
  - `page=1`, `02`, `abc`, tham số lặp: 301 `no-store`.
  - Tag gộp: 301 `REDIRECT_CACHE`, giữ `page`.
  - Trang vượt quá số trang: 404.
- Hydration: `formatDate` cố định `vi-VN` và `Asia/Ho_Chi_Minh`; footer năm dùng `suppressHydrationWarning`; danh sách 18+ chỉ thay sau khi `useMe` resolve.
- Ngoại lệ: M1 và M2.

## Recommended Actions

1. Sửa M1: phân trang theo số trang SSR, hoặc không trả 404 cho trang chỉ tồn tại khi bật 18+. Thêm e2e.
2. Sửa M2: thêm `previousTagSlugs` vào event `story`, đưa vào `catalogUrls`, kèm int test.
3. Ghi chú L1 vào plan phase 15 (làm phẳng chuỗi gộp tag).
4. Tuỳ chọn: bỏ `count` thừa ở trang chủ (L2); thêm meta description cho trang tag (L4); chốt L3.
5. Sau khi e2e xanh: đánh `[x]` checkbox trong spec.

## Metrics

- Type coverage: strict, không `any` mới. Typecheck OK.
- Tests: unit 410/410 pass. Có int core, int API, e2e catalog và e2e auth.
- Lint: lead báo xanh, chưa tự chạy lại.

## Score

**8/10.** Kiến trúc đúng plan, bất biến cache và 18+ ở đường chính được giữ và có test. Bị trừ điểm vì hai lỗ hổng ở biên: phân trang của người đã bật 18+, và purge khi truyện đổi tag.

## Unresolved Questions

- L3: truyện `published` không còn chương đọc được có nên ẩn khỏi trang tag, trang tác giả và phần bù "đáng chú ý" không?
- M2: chấp nhận cửa sổ TTL 10 phút cho trường hợp đổi tag kèm bật 18+, hay sửa ngay trong phase này?

Status: DONE_WITH_CONCERNS
Summary: Phase 10 đạt tiêu chí chính, không có lỗi Critical hay High; còn hai lỗi Medium là link phân trang 404 cho người đã bật 18+ và purge bỏ sót trang tag cũ khi truyện đổi tag.
Concerns/Blockers: M1 và M2 nên sửa trước khi đánh `[x]` checkbox.
