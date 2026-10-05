# Code review: Phase 11, tìm kiếm Meilisearch

Ngày: 2026-10-05 · Phạm vi: diff chưa commit (30 file sửa, ~25 file mới, bỏ qua `.claude/`) · Plan: `plans/261004-1654-giai-doan-1-doc-va-viet/phase-11-tim-kiem-meilisearch.md`

## Tổng quan

Chất lượng tốt, bám sát plan và các pattern sẵn có (`loadOptionalEnv`, outbox `jobsForChange`, `makeTestApiDeps`, `publicPageHeaders`). Đã tự kiểm lại: `pnpm typecheck` xanh, `pnpm test` 450/450, ba file int test search (core, worker, api) 16/16 trên Meilisearch và Postgres thật. Không có lỗi Critical/High. Có 3 lỗi Medium cần sửa trước khi đánh `[x]`; lỗi đầu tiên là bug chức năng có thể tái hiện.

**Điểm: 8/10**

## Critical

Không có.

## High

Không có.

## Medium

### M1. Từ khoá thuần số (`1984`, `2077`) hoặc `true`/`null` bị mất khi vào từ ô tìm kiếm ở header hoặc link phân trang
- `packages/shared/src/schemas/search.ts:34-39`, `apps/web/src/routes/search.tsx:14`, `apps/web/src/components/site-layout.tsx:61`, `apps/web/src/lib/search.ts:16-19`
- Nguyên nhân: `defaultParseSearch` của TanStack Router chạy `JSON.parse` trên từng giá trị. Đã probe: `?q=1984&tag=2024` cho ra `{ q: 1984, tag: 2024 }` (kiểu number). Khi đó `z.string()` fail, `.catch('')` trả chuỗi rỗng, `stripSearchParams` xoá `q` và router trả 307 về `/search`.
- Kịch bản lỗi: người đọc gõ "1984" vào ô ở header (form GET thường) thì rơi về trang duyệt toàn bộ với ô tìm trống. Điều hướng bên trong app vẫn chạy, vì `navigate` tự quote JSON thành `q=%221984%22`. Nhưng link phân trang do `searchHref` dựng bằng `URLSearchParams` (`?q=1984&page=2`) lại làm mất `q`. Tag có slug toàn số cũng bị mất theo cùng cách.
- Cách sửa: trong `searchQuerySchema`, chuyển `q` và `tag` thành chuỗi trước khi validate, ví dụ `z.preprocess((v) => (typeof v === 'number' || typeof v === 'boolean' ? String(v) : v), z.string()...)`. API không bị ảnh hưởng vì Hono luôn đưa chuỗi. Cách này vẫn lệch ở vài ca hiếm (`1e3` thành `"1000"`); muốn tuyệt đối đúng thì cấu hình `parseSearch` của router để giữ chuỗi thô. Nên thêm ca `/search?q=1984` vào e2e.

### M2. Job `search-sync` chỉ thử lại khoảng 2,5 phút; Meilisearch sập lâu hơn thế thì thao tác ẩn hoặc ban không bao giờ được đồng bộ
- `packages/core/src/content/hooks.ts:72-75`
- `searchSync` không đặt `opts`, nên dùng `DEFAULT_JOB_OPTIONS` (5 lần, backoff 10 s: 10+20+40+80 s). `PURGE_RETRY` được đặt 11 lần chính vì lý do này.
- Kịch bản lỗi: Meilisearch restart hoặc nâng cấp mất 5 phút, đúng lúc mod ẩn một truyện (phase 15). Job hết lượt thử, job lỗi chỉ được giữ lại 7 ngày và không tự chạy lại. Tiêu đề, giới thiệu và bìa vẫn hiện trong kết quả tìm kiếm cho tới khi có người chạy `pnpm search:reindex`.
- Cách sửa: `const searchSync = (data) => ({ name, data, opts: PURGE_RETRY })`, hoặc tạo hằng `SEARCH_RETRY` riêng có cùng ngân sách. Cập nhật thêm assertion ở `hooks.test.ts` và `outbox.int.test.ts:157`.

### M3. Hai lần sync chạy song song cho cùng một truyện có thể ghi đè trạng thái mới bằng trạng thái cũ
- `packages/core/src/search/sync.ts:70-97` (và `syncUserContent` :103-116); `apps/worker/src/content-worker.ts:8` (`CONTENT_CONCURRENCY = 4`)
- Mỗi job đọc DB rồi mới enqueue lệnh ghi. Meilisearch xử lý task theo thứ tự enqueue chứ không theo thứ tự đọc DB. Ví dụ: job A (từ sự kiện đăng chương) đọc truyện lúc còn `published`. Mod ẩn truyện, job B đọc thấy `hidden`, enqueue delete. Sau đó A mới enqueue `addDocuments`. Kết quả là truyện đã ẩn vẫn nằm trong index cho tới lần thay đổi kế tiếp hoặc reindex. `storyCount` của tác giả cũng có thể bị lệch theo cùng cách. Cửa sổ race chỉ vài ms (khoảng giữa đọc tag và POST), nên xác suất thấp, nhưng hậu quả rơi đúng vào kiểm duyệt (ẩn, ban). `search-sync.int.test.ts` không bắt được ca này vì chạy tuần tự.
- Cách sửa (rẻ, hội tụ): sau `waitForTask`, đọc lại row. Nếu outcome khác (doc ↔ null) thì apply thêm một lần. Lần đọc lại xảy ra sau khi lệnh ghi của chính job đã được áp, nên job ghi sau cùng luôn thấy trạng thái cuối. Cách khác: dùng group hoặc dedupe của BullMQ theo `storyId`/`userId` để không có hai job cùng entity chạy song song.

## Low

### L1. Master key vẫn có trong `process.env` của web
- `packages/shared/src/env.ts:189-193` (`loadServerEnv` nạp toàn bộ `.env` gốc), `apps/web/src/server/infra.ts:82-90`
- Code web chỉ dùng `MEILI_SEARCH_KEY`, đúng yêu cầu. Nhưng web và Meilisearch dùng chung một `.env`, nên process web vẫn giữ `MEILI_MASTER_KEY`. Lỗ RCE hoặc lộ env ở web sẽ lộ luôn quyền ghi. Ở dev thì chấp nhận được. Khi deploy (thêm service `web` vào compose), cần env riêng cho web không chứa `MEILI_MASTER_KEY`. Có thể thêm guard ở `infra.ts`: production mà `MEILI_SEARCH_KEY === process.env.MEILI_MASTER_KEY` thì throw, để chặn việc dán nhầm master key vào biến search.

### L2. Index bị xoá khi worker đang chạy sẽ được tự tạo lại mà không có settings
- `packages/core/src/search/sync.ts:33-36,51-54`, `apps/worker/src/processors/search-sync.ts:21-33`
- `ensureReady` chỉ chạy một lần, kết quả được nhớ cho tới khi worker restart. Nếu volume Meilisearch mất, `addDocuments` tự tạo index `stories` (primary key suy ra là `publicId`) nhưng không có `filterableAttributes`. Mọi lượt tìm kiếm khi đó trả 503, vì `isMature` không filter được. Index `authors` thì không suy ra được primary key, nên mọi job đều fail. `pnpm search:reindex` sửa được (vì gọi `ensureSearchSettings`), nhưng nên truyền `{ primaryKey }` vào `addDocuments` và reset `ready` khi gặp `index_not_found`.

### L3. Khách vẫn thấy tác giả chỉ có truyện 18+ (hiện "0 truyện")
- `packages/core/src/search/documents.ts:181`
- Điều kiện để index tác giả là `published > 0`, tính cả truyện 18+. Cách này nhất quán với trang tác giả (cũng không 404), nhưng khi người đọc chưa bật 18+ thì kết quả lại hiện "0 truyện". Có thể bỏ qua hiển thị tác giả có `storyCount = 0` với người chưa bật, hoặc chấp nhận và ghi lại quyết định.

### L4. Chuỗi lỗi tiếng Việt trong code mới
- `packages/shared/src/env.ts:110`: `'Biến môi trường không hợp lệ: MEILI_MASTER_KEY (cần tối thiểu 16 byte)'`. Chuỗi này theo đúng pattern cũ của file, nhưng `docs/code-standards.md:7` yêu cầu code mới viết bằng tiếng Anh. Nên viết lại bằng tiếng Anh.

### L5. Sau `pnpm db:seed`, index trống cho tới khi chạy reindex
- Seed không ghi outbox, nên dev mới cài sẽ thấy `/search` rỗng. Nếu index chưa tồn tại thì còn bị 503. Nên thêm "sau `pnpm db:seed` chạy `pnpm search:reindex`" vào bảng lệnh hoặc phần setup trong `CLAUDE.md`.

### L6. Thiếu test cho ca "truyện vừa công khai giữa lúc reindex không bị xoá"
- Ma trận test có ca này. Code xử lý đúng (`rebuild` kiểm lại DB trước khi xoá), nhưng `search.int.test.ts:251` chỉ test ghi đè doc cũ. Có thể thêm một ca: doc có trong index, không nằm trong tập `written`, nhưng DB nói là công khai, thì phải được giữ lại.

## Kiểm tra theo yêu cầu

| Mục | Kết quả |
|---|---|
| (a) Tiêu chí nghiệm thu | Tìm có dấu, không dấu, gõ sai, `đ` (int xanh); lọc tag (kể cả tag đã gộp), trạng thái, số chữ; khách không thấy 18+; sync qua worker; reindex; web chỉ dùng search key. **Checkbox spec chưa `[x]`** (chờ sửa xong review). Sai lệch: M1 (q số). |
| (b) Regression | `jobsForChange`: story/chapter/user đều còn purge; `outbox.int.test` cập nhật đúng; `selectStoryCards` giữ nguyên shape (typecheck xanh); `ContentJobDeps` thêm `search` và các test router/purge đã cập nhật; header thêm form, không phụ thuộc phiên nên HTML cache vẫn giống nhau cho mọi người. |
| (c) Contract công khai | Chỉ thêm `ApiDeps.search` (mặc định `null` trong `makeTestApiDeps`), job `search-sync`, `GET /api/v1/search`. Không có breaking change khác. |
| (d) Pattern | Đúng: `loadOptionalEnv`, route Hono dạng chain, `errorBody`, `publicPageHeaders(match.status)` (tránh được bẫy 500 thành cache công khai), `<a>` thường cho link tới trang được cache. |
| (e) Bảo mật | Filter chỉ dựng từ giá trị đã qua Zod (slug regex, enum, int) hoặc slug lấy từ DB, nên không có injection. `isMature = false` do server ép theo `getPreferences`. Doc không chứa UUID hay email; hit được map lại qua `storyDocToCard`/`toAuthorHit` nên không lộ field thừa. `avatarUrl` hiện luôn `null` (hook chặn `image`). Log lỗi chỉ in `name: message`. Rủi ro còn lại xem L1. |
| (f) Reindex, sync, task, timeout | Xoá doc thừa có kiểm lại DB trước khi xoá; keyset theo id; mọi lệnh ghi chờ task và kiểm `succeeded`; HTTP timeout 10 s, chờ task 30 s; thiếu index thì tạo lại, các lỗi khác ném ra. Sync idempotent khi chạy tuần tự, nhưng chưa an toàn khi chạy song song (M3). Ngân sách retry xem M2. |

## Việc nên làm (theo thứ tự)

1. M1: chuyển `q`/`tag` thành chuỗi trong `searchQuerySchema` và thêm e2e cho `/search?q=1984`.
2. M2: đặt `opts: PURGE_RETRY` (hoặc `SEARCH_RETRY`) cho `search-sync`.
3. M3: đọc lại row sau khi ghi trong `syncStory`/`syncAuthor`/`syncStoryAndAuthor`.
4. L1: ghi vào checklist deploy (env riêng cho web) và thêm guard dán nhầm key.
5. L2–L6 tuỳ chọn.

## Câu hỏi chưa giải quyết

- User đã đồng ý sửa `CLAUDE.md` chưa? Plan ghi "chờ user đồng ý".
- L3: user có muốn ẩn tác giả chỉ có truyện 18+ khỏi kết quả của khách không?
