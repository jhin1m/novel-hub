# Review phase 7 — trang đọc chương (route, cache, UI)

Ngày 2026-10-05. Phạm vi: diff chưa commit (bỏ `plans/.../plan.md`, `.claude/`), ~2.1k LOC mới. Không chạy lại e2e; typecheck/lint/unit đã xanh theo báo cáo cook.

## Đánh giá chung

Chất lượng tốt: `canReadChapter` đúng một điểm quyết định, SQL dạng `readableChapterWhere()` đi kèm, không lộ UUID, author note render text, `canonicalPath` dùng nhất quán, e2e phủ đúng ma trận header. Một lỗi production thật ở nhánh lỗi 5xx của `headers()`; còn lại là a11y và vài điểm latent.

## High

### H1. Loader lỗi (DB/Redis sập) trả 500 với `Cache-Control: public, s-maxage=60`

`apps/web/src/routes/stories.$storyKey.chapter-{$number}.tsx:31-34`

`headers` coi mọi trường hợp `!loaderData` là 404. Đã kiểm source router-core 1.171.34:
- `load-server.js:308-320` (`applyFailure`): loader throw lỗi thường → match `status: 'error'`, response 500.
- `load-server.js:371-400` (`projectLane`): `headers()` **vẫn được gọi** cho match lỗi (chỉ `break` sau khi gọi), `loaderData` = `undefined` → trả `NOT_FOUND_CACHE`.

Hệ quả: một lần Postgres chập chờn → mỗi URL chương bị hỏi trong lúc đó trả 500 có `public, s-maxage=60`; với Cache Rule "Edge TTL: dùng header origin" (docs/deployment-cloudflare.md) Cloudflare có thể giữ trang lỗi tới 60s sau khi origin đã hồi. Thêm nữa `match.error` được dehydrate vào HTML (`ssr/ssr-server.js:23`, khoá `e`) — message lỗi pg/drizzle (host nội bộ, câu SQL, params) có thể nằm trong HTML được cache công khai. Phase 10 dự kiến dùng lại khuôn này cho trang truyện/tác giả/tag, nên sửa ngay ở đây.

Sửa: dựa vào `match.status`, không dựa vào `loaderData`:

```ts
headers: ({ match, loaderData }) => {
  if (match.status === 'notFound') return NOT_FOUND_CACHE;
  if (match.status !== 'success' || !loaderData) return NO_STORE;
  return loaderData.story.isMature ? { ...PUBLIC_CACHE, ...NOINDEX } : PUBLIC_CACHE;
},
```

Nên tách thành hàm thuần trong `lib/cache-headers.ts` (phase 10 dùng lại) + unit test ba nhánh.

## Medium

### M1. Màn 18+: `aria-modal` nhưng không giữ focus; `aria-hidden` bọc phần tử focus được
`components/reader/mature-gate.tsx:30-35`, route `:77`

`<main aria-hidden>` chứa link tên truyện và nút "Chương tiếp" vẫn tab tới được (vi phạm axe `aria-hidden-focus`); `ReaderNav` (ngoài `main`, z-30 dưới gate) không bị ẩn nên Tab/screen reader đi vào thanh điều hướng vô hình phía sau overlay. Không có focus ban đầu vào dialog. Đề xuất: dùng `inert` (React 19 hỗ trợ) cho `main` và `nav` khi `gated`, đặt focus vào heading/nút đầu của gate khi mount phía client.

### M2. Nhánh client của `requestedHref` đọc `window.location`, không phải location của lần load
`apps/web/src/lib/canonical.ts:17-19`

Hiện tại latent (không có `<Link>` client tới route chương, `defaultPreload` tắt, không có `router.invalidate`). Nhưng nếu phase sau thêm `<Link to=chapter preload>` hoặc invalidate, loader chạy ở client với `window.location` của trang hiện tại → `assertCanonical` ném 301 sai (preload) và mỗi lần như vậy là một RPC `/_serverFn` lách CDN. Phía client không có CDN nên không cần raw URL: truyền `location.href` của router vào nhánh client, hoặc chỉ gọi `assertCanonical` khi `typeof window === 'undefined'`. Ghi rõ trong comment để phase 10 không chép sai.

## Low

- L1. `ReaderPage` luôn gọi `useMe()` (qua `useMatureAllowed`) kể cả truyện không 18+ → mỗi lượt xem chương một request `/api/v1/me` tới origin; với user đăng nhập nay thêm một truy vấn `getPreferences` (`packages/api/src/routes/me.ts:18`). Chấp nhận được vì phase 8/9 cũng cần, nhưng cân nhắc `enabled: story.isMature` cho tới khi phase 8 thật sự cần `me` ở trang đọc.
- L2. Comment đầu `apps/web/src/server-fns/reader.ts:1-5` nói "never by calling these functions directly", trái với `getChapterToc` gọi từ trình duyệt (`chapter-toc-sheet.tsx:29`). Sửa comment cho đúng (comment phải nói vì sao, không được sai).
- L3. `neighbourNumbers` (`get-chapter-for-reading.ts:123`): comment "index serves each aggregate" phóng đại — `max(case when …)` không dùng được tối ưu min/max của index, quét toàn bộ chương đọc được của truyện. O(số chương), ổn ở quy mô hiện tại và trang được cache; sửa comment hoặc dùng hai subquery `ORDER BY number DESC/ASC LIMIT 1` nếu muốn đúng lời.
- L4. `MatureGate` dùng `<Link to="/" reloadDocument>` và `<Link to="/sign-in">` trong khi phần còn lại dùng `<a href={canonicalPath(...)}>` (deviation 4). Nên dùng `canonicalPath({ kind: 'home' })` cho đồng nhất. Sign-in xong điều hướng về `/` (code cũ), người đọc mất vị trí — ghi nhận cho phase sau (redirect về trang đang đọc).
- L5. `useArrowKeys` bị vô hiệu vĩnh viễn trên trang 18+ nếu `/me` lỗi mạng/5xx với người có cờ `nh:mature` (gate vẫn trong DOM, chỉ bị CSS ẩn, `querySelector('[role=alertdialog]')` vẫn khớp). Hiếm; có thể kiểm `checkVisibility()`/`offsetParent`.
- L6. `ReaderNav` ẩn bằng `transform` nhưng vẫn focus được; Tab vào thanh đang ẩn không làm nó hiện. Thêm `&:focus-within { transform: none }` trong `reader.css`.
- L7. `usePrefetchNext` chỉ kiểm khi scroll/mount, không kiểm khi `resize` (xoay màn hình, phase 8 đổi cỡ chữ). Ảnh hưởng nhỏ.
- L8. `reader-nav.tsx:57` dùng `React.ReactNode` không import `React` (global UMD type), lệch với chỗ khác import `type ReactNode`.

## Deviations đã khai báo

1. `/` cuối → 307 của router không header cache: hợp lý; Edge TTL "bypass nếu không có header" nên CF không cache. OK.
2. `%2D` decode → 200: hợp lý với điều kiện Cloudflare "Normalize incoming URLs" bật (đã ghi doc). Lưu ý trong doc thêm: đây là cài đặt zone-wide, ai tắt sẽ mở lại lỗ này — đề nghị đưa vào checklist kiểm sau deploy (`curl` một URL `%2D` thấy HIT chung key).
3. `requestedHref` cho `?` rỗng: đúng ở server; xem M2 cho client.
4. `<a href>` thay `<Link reloadDocument>`: hợp lý, e2e chứng minh không có `/_serverFn`.
5. scroll + rAF thay IntersectionObserver: hợp lý (lý do đúng); xem L7.
6. TOC gọi server fn từ browser: đúng plan; `/_serverFn` không cache, chưa có rate limit (checkbox rate limit sau) — chấp nhận.

## Scout / kiểm chứng

- `useMe` consumers (`site-layout`, `writer-gate`, `index`, `write/*`): chỉ đọc field cũ, không ai `setQueryData` object user thiếu `preferences` → không vỡ `me.data.preferences`. `syncMatureFlag` chỉ chạy trong `queryFn` (browser, không có prefetch SSR) nên không đụng `document` ở server.
- `/me` thêm field là tương thích ngược; test signed-in chuyển sang `me.int.test.ts` (cần DB thật) hợp lý, test unit còn lại kiểm Set-Cookie với `user: null` + 401.
- Root: `suppressHydrationWarning` chỉ trên `<html>`, script boot tĩnh, try/catch — OK.
- SQL: truy vấn chính dùng unique `public_id` + unique `(story_id, number)`; điều kiện ban/visibility/deleted nằm trong `canReadChapter` và `readableChapterWhere` cùng file. Warning tags: một bước `canonical_id`, khử trùng theo slug, lọc `kind` sau khi quy về canonical — đúng ý spec. Nếu tag gộp có thể chuỗi nhiều bước (A→B→C) thì chỉ đi một bước; xác nhận phase gộp tag luôn làm phẳng.
- XSS: `dangerouslySetInnerHTML` chỉ nhận `chapter_contents.html` (sanitize lúc đăng); author note render text, e2e kiểm `<b>` hiển thị nguyên văn.
- Không UUID trong loader data (`storyId` chỉ dùng nội bộ core). i18n đủ, identifier/comment tiếng Anh.
- `.validator()` đúng API hiện hành (`inputValidator` đã deprecated ở start-client-core).
- e2e chạy trên `vite dev`; header trên bản build cần kiểm tay như plan bước 12 (không thấy kết quả trong phạm vi review).

## Việc nên làm (ưu tiên)

1. H1: sửa `headers` theo `match.status`, tách hàm thuần + unit test.
2. M1: `inert` cho `main`/`nav` khi gated, focus vào gate.
3. M2: sửa nhánh client của `requestedHref` hoặc chỉ assert ở server.
4. L2, L3: sửa comment sai.

## Câu hỏi mở

- Gộp tag có đảm bảo `canonical_id` luôn trỏ tới tag gốc (không chuỗi)?
- Đã kiểm header trên bản build (`.output`) chưa (plan bước 12)?

Status: DONE_WITH_CONCERNS
Summary: 8/10 — Critical 0, High 1, Medium 2, Low 8.
Concerns/Blockers:
- High: `apps/web/src/routes/stories.$storyKey.chapter-{$number}.tsx:31-34` — 500 do loader lỗi mang `public, s-maxage=60` (và lỗi dehydrate vào HTML).
- Medium: `apps/web/src/components/reader/mature-gate.tsx:30-35` + route `:77` — `aria-hidden` bọc phần tử focus được, không giữ focus.
- Medium: `apps/web/src/lib/canonical.ts:17-19` — nhánh client dùng `window.location`, sai khi loader chạy client (preload/invalidate).
