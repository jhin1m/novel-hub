# Web truyện sáng tác — Tài liệu dự án cho Claude Code

Oct 4, 2026 · @Duc

## 1. Tổng quan

Nền tảng truyện chữ sáng tác gốc tiếng Việt: người dùng tự viết và đăng truyện, độc giả đọc miễn phí. Năm đầu hoàn toàn miễn phí, không thanh toán, không AI.

**Mục tiêu năm đầu**

- Trải nghiệm viết đủ tốt để kéo và giữ tác giả (editor, autosave, phiên bản, hẹn giờ đăng).
- Trải nghiệm đọc sạch, nhanh, mobile-first; trang đọc SSR và cache ở CDN.
- Tác giả thấy có người đọc: theo dõi, thông báo chương mới, bình luận, thống kê.
- Kiểm duyệt đủ chặt để nội dung gốc không bị pha loãng bởi spam, đạo văn, truyện đăng lại.

**Để sau cùng (không làm trong năm đầu):** AI Hub và mọi thứ liên quan đến tiền (donate, chương trả phí, ví, hội viên). Chỉ chừa sẵn đường, xem mục 10.

Người làm: một dev full-stack, nên mọi quyết định ưu tiên đơn giản, ít thành phần vận hành.

## 2. Stack công nghệ

Toàn bộ TypeScript, một monorepo, type dùng chung từ DB tới UI. Pin version, đọc release notes trước khi nâng TanStack Start.

| Lớp | Lựa chọn | Ghi chú |
| --- | --- | --- |
| Frontend + SSR | TanStack Start (React, Vite, Nitro) | SSR cho trang truyện, chương, tác giả, tag; search params có type cho trang lọc |
| Data fetching client | TanStack Query | Tích hợp sẵn với Start |
| API | Hono + `@hono/zod-validator`, client `hc<AppType>` | Mount trong Start qua server route `/api/$` lúc đầu; tách service riêng khi cần |
| Validation | Zod | Dùng chung schema giữa API và form |
| DB | PostgreSQL + Drizzle ORM + drizzle-kit migrations |  |
| Cache, counter, xếp hạng, rate limit | Redis |  |
| Hàng đợi job | BullMQ (trên Redis) | Worker là process riêng |
| Tìm kiếm | Meilisearch | Xử lý tiếng Việt có dấu và không dấu, gõ sai |
| Auth | Better Auth (adapter Drizzle) | Email/mật khẩu + OAuth Google; bắt buộc xác thực email trước khi đăng truyện, chương, bình luận |
| Editor | Tiptap (ProseMirror) | Lưu JSON, render HTML khi đăng |
| UI styling | Tailwind CSS v4 + CSS variables; shadcn/ui chỉ thêm component cần dùng | Tokens khai báo một nơi (mục 8); kèm dependency bắt buộc của shadcn (Radix, clsx, tailwind-merge, class-variance-authority) |
| i18n | Paraglide JS (inlang) | Compile-time, type-safe, tree-shake; tiếng Việt mặc định |
| Sanitize HTML | `sanitize-html` | Chạy phía server khi đăng chương; whitelist đúng các thẻ Tiptap sinh ra |
| Xử lý ảnh | `sharp` | Resize, chuyển WebP |
| Email | `nodemailer` qua SMTP | Không khóa nhà cung cấp (Resend, SES, Brevo đều có SMTP); môi trường dev in link xác thực ra log |
| Icon | `lucide-react` |  |
| Lưu trữ ảnh | S3-compatible (MinIO tự host, server có sẵn) | Bìa truyện, avatar. Dev và production dùng cùng server MinIO; dev dùng bucket riêng |
| Hạ tầng | Docker Compose trên 1 VPS, Cloudflare phía trước |  |
| Test | Vitest (unit), Playwright (luồng chính) |  |
| Chất lượng code | TypeScript strict, ESLint, Prettier |  |

Package manager: pnpm workspaces.

## 3. Kiến trúc và cấu trúc repo

Hai process chạy production: `web` (TanStack Start, chứa cả Hono API) và `worker` (BullMQ). Cả hai dùng chung package `core` chứa logic nghiệp vụ, nên không có logic nào bị viết hai lần.

```
.
├── apps/
│   ├── web/                 # TanStack Start: routes, components, server routes
│   │   └── src/
│   │       ├── routes/          # file-based routes; routes/api/$.ts mount Hono
│   │       ├── components/
│   │       ├── server-fns/      # createServerFn chỉ dùng cho UI nội bộ
│   │       └── styles/
│   └── worker/              # BullMQ processors: counters, dedupe, notifications, search sync
├── packages/
│   ├── api/                 # Hono app, export type AppType
│   ├── core/                # service layer: stories, chapters, access, moderation...
│   ├── db/                  # Drizzle schema, migrations, client
│   ├── auth/                # cấu hình Better Auth
│   └── shared/              # Zod schemas, constants, types dùng chung
├── docker/
└── docker-compose.yml       # postgres, redis, meilisearch (dev); web, worker thêm khi deploy
```

**Ranh giới API**

- Server functions (`createServerFn`): dữ liệu chỉ UI của web dùng (loader trang, form nội bộ).
- Hono (`/api/*`): mọi thứ có thể có consumer khác sau này (admin, mobile, worker, webhook). Coi là API contract, đặt version `/api/v1`.
- Cả hai chỉ là lớp mỏng: validate input, kiểm tra quyền, gọi `core`. Không truy vấn DB trực tiếp từ route.

**Việc nặng hoặc chậm luôn đi qua hàng đợi:** ghi dồn lượt đọc, kiểm tra trùng lặp, gửi thông báo cho người theo dõi, đồng bộ Meilisearch, purge cache CDN.

## 4. Mô hình dữ liệu cốt lõi

Nguyên tắc: metadata chương tách khỏi nội dung; bản nháp tách khỏi bản đã đăng; mọi bảng dùng khóa chính UUIDv7 nội bộ, URL công khai dùng `slug` kèm `public_id` (không bao giờ hiển thị UUID ra UI). Thời gian lưu `timestamptz`.

| Bảng | Cột chính | Ghi chú |
| --- | --- | --- |
| `users` | id, username (unique), display\_name, email (unique), email\_verified, avatar\_url, bio, role, status, preferences, created\_at, updated\_at | Bảng auth do Better Auth quản lý (`email`, `email_verified` do Better Auth ghi; `display_name`/`avatar_url` là field `name`/`image` của Better Auth); `username` khớp `^[a-z0-9_]{3,30}$`; `role` = reader/author/mod/admin; `status` = active/muted/banned; `preferences` (jsonb, validate bằng Zod) chứa cài đặt trang đọc và tuỳ chọn NSFW |
| `sessions`, `accounts`, `verifications` | (do Better Auth quy định) | Bảng của Better Auth: phiên đăng nhập; liên kết OAuth và mật khẩu (hash); token xác thực email và đặt lại mật khẩu |
| `stories` | id, public\_id, slug, author\_id, title, synopsis, cover\_url, main\_tag\_id, status, visibility, is\_ai\_assisted, is\_mature, word\_count, chapter\_count, last\_chapter\_at, created\_at, updated\_at | `public_id` = mã ngắn ngẫu nhiên, unique, dùng trong URL; `status` = ongoing/completed/hiatus; `visibility` = draft/published/hidden\_by\_mod; `main_tag_id` là tag chính (kind = genre), dùng cho thẻ truyện và màu bìa mặc định |
| `tags`, `story_tags` | tag: id, slug, name, kind, canonical\_id | `canonical_id` để gộp tag trùng; `kind` = genre/theme/warning |
| `chapters` | id, story\_id, number, title, author\_note, word\_count, status, published\_at, scheduled\_at, created\_at, updated\_at, deleted\_at | Không chứa nội dung; unique (story\_id, number); `status` = draft/scheduled/published/hidden\_by\_mod; `author_note` là lời nhắn cuối chương |
| `chapter_contents` | chapter\_id (PK), doc\_json, html, paragraph\_ids, content\_hash | Bản đã đăng; `html` đã sanitize; mỗi đoạn có `data-pid` ổn định |
| `chapter_drafts` | chapter\_id (PK), doc\_json, updated\_at | Autosave ghi đè vào đây |
| `chapter_revisions` | id, chapter\_id, doc\_json, word\_count, created\_at | Giữ N bản gần nhất mỗi chương (mặc định 20) |
| `chapter_fingerprints` | chapter\_id, minhash (int\[\]), simhash (bigint) | Phục vụ kiểm tra trùng lặp |
| `follows` | user\_id, target\_type, target\_id, created\_at | Theo dõi truyện hoặc tác giả |
| `library_items` | user\_id, story\_id, shelf, added\_at | Tủ truyện: reading/plan/done/dropped |
| `reading_progress` | user\_id, story\_id, chapter\_id, scroll\_pct, updated\_at | Đọc tiếp; cũng là nguồn cho thống kê bỏ dở |
| `comments` | id, chapter\_id, story\_id, user\_id, parent\_id, paragraph\_id (nullable), body, status, created\_at | `paragraph_id` để sẵn cho bình luận theo đoạn |
| `ratings` | user\_id, story\_id, score, review, created\_at | Mỗi user một đánh giá/truyện; `score` là số nguyên 1–5 |
| `notifications` | id, user\_id, type, payload (jsonb), read\_at, created\_at | Thông báo trong app |
| `reports` | id, reporter\_id, target\_type, target\_id, reason, detail, status, handled\_by, created\_at | Hàng chờ kiểm duyệt |
| `moderation_actions` | id, mod\_id, target\_type, target\_id, action, note, created\_at | Nhật ký mọi hành động của mod |
| `chapter_daily_stats` | chapter\_id, date, views, unique\_readers, completions | Ghi dồn từ Redis bởi worker |
| `badges`, `user_badges` |  | Huy hiệu và cột mốc |
| `featured_slots` | id, story\_id, slot, starts\_at, ends\_at | Truyện nổi bật do mod chọn |

Các bảng `badges`, `featured_slots`, `ratings`, `comments` thuộc giai đoạn 2 nhưng nên thiết kế sẵn trong schema đầu tiên để tránh migration lớn.

**URL và slug**

| Trang | URL |
| --- | --- |
| Truyện | `/stories/{slug}-{public_id}` (ví dụ `/stories/kiem-dao-doc-ton-k7m2xq9p`) |
| Chương | `/stories/{slug}-{public_id}/chapter-{number}` |
| Tác giả | `/authors/{username}` |
| Tag | `/tags/{tag-slug}` |
| Tìm kiếm | `/search?q=...` (search params có type) |

URL và tên file route đều tiếng Anh (user chốt 2026-10-05); slug truyện/tag vẫn sinh từ tiêu đề tiếng Việt không dấu.

- Truyện được tra theo `public_id` (đoạn sau dấu `-` cuối cùng); slug chỉ để đọc cho đẹp và SEO.
- `public_id`: 8 ký tự ngẫu nhiên từ bảng chữ thường + số, bỏ ký tự dễ nhầm (0/o, 1/l/i); sinh bằng `crypto.getRandomValues`, gặp trùng thì sinh lại. Không suy ra từ UUID (UUIDv7 dài và lộ thời điểm tạo).
- Slug sinh tự động từ tiêu đề: bỏ dấu tiếng Việt (gồm `đ` → `d`), chữ thường, nối bằng `-`, cắt ở ~60 ký tự. Tác giả không tự sửa slug. Slug không cần duy nhất.
- Slug trên URL khác slug hiện tại (do đổi tên truyện hoặc gõ sai) thì redirect 301 về URL chuẩn; canonical URL luôn dùng slug hiện tại. Đổi tên truyện thì worker purge cả URL cũ lẫn mới.
- Tag bị gộp (`canonical_id`) thì redirect 301 sang tag chuẩn.
- `username` không bao giờ đổi được.
- Năm đầu không có quyển/tập: truyện là danh sách chương phẳng.
- `chapters.number` gán tăng dần khi tạo và không đổi sau khi đăng (URL phụ thuộc vào nó). Xóa chương đã đăng là xóa mềm (`deleted_at`), số chương để trống, không đánh số lại.

**Giới hạn nội dung** (giá trị khởi điểm, khai báo trong `packages/shared`, dùng chung cho Zod API và form)

- Tên truyện 2–150 ký tự; giới thiệu ≤ 3.000 ký tự; tên chương ≤ 150 ký tự; lời nhắn tác giả ≤ 1.000 ký tự.
- Chương khi đăng: 300–20.000 chữ. Bản nháp không giới hạn dưới.
- Tag: đúng 1 tag chính (kind = genre), tổng ≤ 10 tag mỗi truyện.
- Bìa: JPG/PNG/WebP ≤ 5 MB, tối thiểu 600×900; lưu WebP hai cỡ 600×900 và 300×450.
- Avatar: ≤ 2 MB, lưu WebP 256×256.

## 5. Tính năng theo giai đoạn

Làm tuần tự; mỗi mục chỉ coi là xong khi đạt tiêu chí và có test cho luồng chính.

### Giai đoạn 0: Nền móng

- [x] Monorepo pnpm, TypeScript strict, ESLint, Prettier, Vitest.
- [x] Docker Compose: postgres, redis, meilisearch (MinIO dùng server có sẵn); `.env.example` đầy đủ.
- [x] Drizzle schema mục 4 + migration đầu tiên + seed dữ liệu mẫu.
- [x] Hono mount tại `/api/$`, client `hc` dùng được từ web, có route `/api/v1/health`.
- [x] Better Auth: đăng ký, đăng nhập, OAuth Google, phiên, middleware phân quyền.
- [x] Worker BullMQ chạy được một job mẫu.

### Giai đoạn 1: Đọc và viết

- [ ] Tạo và sửa truyện: tiêu đề, giới thiệu, bìa (upload S3, resize), tag, cờ 18+, cờ có dùng AI.
- [x] Bìa mặc định dạng chữ khi tác giả không có bìa.
- [x] Editor Tiptap: autosave vào `chapter_drafts` (debounce \~2 giây), trạng thái đã lưu, chế độ tập trung.
- [x] Đăng chương: sinh HTML đã sanitize, gắn `data-pid`, ghi revision, đếm số chữ, hẹn giờ đăng.
- [x] Khôi phục từ revision cũ.
- [x] Trang đọc chương theo mục 6 và mục 8.
- [x] Trang truyện, trang tác giả, trang tag, trang chủ (mới cập nhật, truyện mới đáng chú ý).
- [x] Tìm kiếm Meilisearch: truyện và tác giả, lọc theo tag, trạng thái, số chữ.
- [x] Tủ truyện và lịch sử đọc, nút đọc tiếp.
- [x] Rate limit Redis theo user và IP: đăng ký, đăng nhập, quên mật khẩu, tạo truyện, đăng chương, bình luận, báo cáo (mục 7).
- [x] Kiểm tra trùng lặp khi đăng chương, báo cáo vi phạm, trang hàng chờ cho mod (mục 7).
- [x] SEO: metadata, Open Graph, sitemap, canonical URL.
- [ ] Trước khi mở public: backup Postgres ra ngoài VPS và thử restore thành công (mục 11).

### Giai đoạn 2: Cộng đồng

- [ ] Bình luận chương (2 cấp), sau đó bình luận theo đoạn.
- [ ] Theo dõi truyện và tác giả; thông báo trong app khi có chương mới.
- [ ] Đánh giá và review truyện.
- [ ] Xếp hạng ngày, tuần, tháng; xếp hạng theo tốc độ tăng trưởng.
- [ ] Dashboard tác giả: lượt đọc theo chương, tỷ lệ bỏ dở theo chương, lượt theo dõi mới.
- [ ] Huy hiệu và cột mốc; khu truyện nổi bật do mod chọn; công cụ tổ chức cuộc thi theo chủ đề.

### Giai đoạn 3 (sau cùng)

AI Hub và kiếm tiền. Không làm cho tới khi được yêu cầu rõ ràng.

## 6. Trang đọc, cache và số liệu

Phần lớn traffic là đọc, nên HTML công khai phải được Cloudflare cache; origin chỉ gánh request động.

**Cache**

- Trang chương, truyện, tác giả, tag trả `Cache-Control: public, s-maxage=<dài>, stale-while-revalidate`. Không phụ thuộc cookie; HTML giống hệt cho mọi người.
- Phần cá nhân hóa (đã đăng nhập, đã theo dõi, tiến độ đọc, số bình luận mới) tải riêng ở client qua API không cache.
- Khi đăng, sửa, ẩn chương hoặc truyện: worker purge các URL liên quan qua Cloudflare API.
- Mọi quyết định "được cache công khai không" và "được đọc không" đi qua một hàm duy nhất `canReadChapter()` trong `core/access` (mục 10).

**Trang đọc**

- Server trả HTML chương đã sanitize; không render Tiptap ở trang đọc.
- Cài đặt hiển thị lưu localStorage, áp dụng bằng script inline trong `<head>` để không nháy nền.
- Prefetch chương tiếp theo khi người đọc cuộn qua \~70%.
- Ghi tiến độ đọc theo debounce và khi rời trang (`sendBeacon`).

**Lượt đọc và xếp hạng**

- Không bao giờ `UPDATE ... views = views + 1` mỗi lượt đọc. Tăng counter trong Redis, dùng HyperLogLog cho người đọc duy nhất.
- Worker ghi dồn vào `chapter_daily_stats` mỗi 5 phút.
- Bảng xếp hạng ngày, tuần, tháng và tăng trưởng là Redis sorted set, tính lại định kỳ.
- Chống bơm view: chỉ đếm khi ở lại trang tối thiểu vài chục giây, giới hạn theo user/IP mỗi chương mỗi ngày.

## 7. Kiểm duyệt, phân quyền, chống trùng lặp

Công cụ mod phải có trước khi mở cộng đồng.

**Phân quyền**

- Vai trò: reader, author (tự động khi tạo truyện đầu tiên), mod, admin.
- Kiểm tra quyền tập trung ở `core/policies` (ví dụ `canEditStory(user, story)`), không rải trong route.
- Tài khoản `muted` không đăng bình luận; `banned` không đăng nhập được, nội dung bị ẩn.

**Rate limit (Redis)**

- Đăng ký, đăng nhập, tạo truyện, đăng chương, bình luận, báo cáo đều có giới hạn theo user và IP.
- Tài khoản mới có giới hạn chặt hơn trong những ngày đầu.

**Kiểm tra trùng lặp (worker)**

1. Khi chương được đăng: chuẩn hóa văn bản (bỏ HTML, hạ chữ thường, chuẩn Unicode NFC), tách shingle theo từ.
2. Tính MinHash và SimHash, lưu vào `chapter_fingerprints`.
3. So với kho hiện có (LSH bucket hoặc khoảng cách Hamming). Loại trừ chương cùng tác giả.
4. Vượt ngưỡng thì tạo `report` tự động với lý do trùng lặp; không tự ẩn, để mod quyết.

**Báo cáo và hàng chờ**

- Người dùng báo cáo truyện, chương, bình luận, tài khoản: vi phạm bản quyền, đạo văn, spam, nội dung cấm, gắn nhãn sai.
- Trang mod: lọc theo trạng thái và lý do, xem ngữ cảnh, hành động một cú bấm (ẩn, khôi phục, mute, ban, gộp tag).
- Mọi hành động ghi vào `moderation_actions`.

**Nội dung 18+ và tuỳ chọn NSFW**

- Tuỳ chọn "Hiện nội dung 18+" (`preferences.showMature`) mặc định tắt. Chỉ tài khoản đã đăng nhập mới bật được; khi bật phải tự xác nhận đủ 18 tuổi.
- Khi tắt (và với mọi khách): truyện `is_mature` không xuất hiện ở trang chủ, trang tag, tìm kiếm, bảng xếp hạng, khu truyện nổi bật.
- Khi bật: các danh sách trên tải thêm truyện 18+ qua API không cache ở client. HTML render phía server của mọi danh sách luôn không chứa truyện 18+, nên vẫn cache công khai được.
- Mở trực tiếp link truyện hoặc chương 18+ khi chưa bật: hiện màn cảnh báo kèm các tag `warning`, xử lý hoàn toàn ở client (HTML không phụ thuộc cookie). Khách phải đăng nhập và bật tuỳ chọn mới đọc được.
- Truyện 18+ không vào sitemap; trang truyện và chương có `<meta name="robots" content="noindex">`.

**Điều khoản:** tác giả giữ bản quyền, site được cấp quyền hiển thị miễn phí, mọi hình thức kiếm tiền sau này là opt-in. Trang điều khoản và quy định nội dung có từ giai đoạn 1.

## 8. Ngôn ngữ thiết kế và quy tắc UI

Hướng "yên tĩnh, đậm chất sách", mobile-first. Khu đọc gần như vô hình, khu khám phá giống hiệu sách, khu viết tập trung. Không quảng cáo, không banner, không popup.

**Nền tảng chung**

- Màu: tông trung tính ấm (trắng ngà, xám than) + một màu nhấn duy nhất (chốt khi dựng Design System). Khai báo bằng CSS variables, có light và dark; khu đọc thêm sepia.
- Chữ: Literata cho nội dung truyện, Be Vietnam Pro cho giao diện. Self-host font, subset đủ tiếng Việt.
- Nguồn chuẩn về thiết kế: `docs/design-guidelines.md` (ghi link Design System và mockup) và file tokens trong `apps/web/src/styles/`. Khi hai nơi lệch nhau, file tokens trong repo là chuẩn.
- Nhiều khoảng trắng, bo góc nhỏ, bóng đổ tối thiểu, không gradient.
- Không thêm thanh tiến trình chuyển trang ở đầu màn hình.
- Không hiển thị ID nội bộ ra giao diện.
- Mọi chuỗi hiển thị đi qua hệ thống i18n (tiếng Việt mặc định), không hardcode.

**Khu đọc**

- Cỡ chữ mặc định 18–20px trên mobile, line-height 1.75–1.9 (dấu tiếng Việt chồng nhiều tầng), độ dài dòng 60–75 ký tự trên desktop.
- Bảng tuỳ chỉnh (mở từ nút cài đặt trên thanh điều hướng, xem trước ngay khi chỉnh):
  - Màu nền: bộ preset có sẵn (sáng, ngà, sepia, xanh dịu, xám tối, đen OLED); mỗi preset đi kèm màu chữ đạt tương phản WCAG AA. Không có bảng chọn màu tự do.
  - Font: Literata, Noto Serif, Be Vietnam Pro, Inter (tối đa 4, đều self-host subset tiếng Việt). Font khác mặc định chỉ tải khi người đọc chọn.
  - Cỡ chữ 14–28px, khoảng cách dòng 1.5–2.2, khoảng cách đoạn, độ rộng cột chữ (hẹp/vừa/rộng, chỉ trên desktop), căn lề trái/đều.
  - Nút "Khôi phục mặc định".
- Lưu cài đặt ở localStorage để script inline áp dụng trước khi vẽ trang; người đã đăng nhập đồng bộ thêm vào `users.preferences` để dùng chung trên nhiều thiết bị.
- Thanh điều hướng ẩn khi cuộn xuống, hiện khi cuộn lên hoặc chạm giữa màn hình. Chỉ gồm: tên chương, chương trước/sau, mục lục, cài đặt.
- Không chèn gì vào giữa nội dung. Cuối chương: nút chương tiếp thật to, lời nhắn tác giả, bình luận.
- Bàn phím: mũi tên trái/phải để chuyển chương.

**Khu khám phá**

- Bìa là trung tâm thị giác, tỷ lệ 2:3. Bìa mặc định dạng chữ (tên truyện, bút danh, màu nền sinh từ tag chính) phải đủ đẹp để một lưới toàn bìa mặc định vẫn chỉnh tề.
- Thẻ truyện hiện: tag chính, số chương, tổng số chữ, trạng thái, lần cập nhật gần nhất, nhãn có dùng AI nếu có.
- Trang truyện: thông tin như tần suất ra chương và số chữ, trình bày gọn như một trang sách.

**Khu viết**

- Editor nền trơn, không sidebar thừa, trạng thái lưu nhỏ ở góc, chế độ tập trung che mọi thứ trừ chữ.
- Dashboard tác giả là nơi duy nhất được dày số liệu và biểu đồ.

## 9. Quy ước code và cách làm việc cho Claude Code

**Cách làm việc**

- Đọc tài liệu này trước mỗi phiên. Làm đúng một mục trong checklist mục 5 mỗi lần, không nhảy giai đoạn.
- Trước khi sửa: đọc file và cấu trúc liên quan, nêu kế hoạch ngắn. Giữ thay đổi nhỏ, KISS, không refactor rộng ngoài phạm vi.
- Sau khi sửa: chạy `pnpm typecheck`, `pnpm lint`, `pnpm test` (và migration nếu đổi schema). Chưa xanh thì chưa xong.
- Không commit/push trừ khi được yêu cầu. Khi commit: chỉ stage file liên quan, message theo Conventional Commits.
- Không tự đổi config (Docker, env, CI, Cloudflare) nếu chưa được đồng ý.
- Không thêm dependency mới ngoài stack mục 2 mà không hỏi trước.
- Báo cáo kết quả gắn với file, route, lệnh cụ thể; nếu bị chặn thì nêu đúng lệnh và lỗi.

**Quy ước code**

- TypeScript strict, không `any`. Input từ ngoài luôn validate bằng Zod.
- Logic nghiệp vụ nằm trong `packages/core`; route, server function, worker chỉ gọi vào đó.
- Kiểm tra quyền qua `core/policies`, quyền đọc qua `core/access`.
- HTML từ người dùng luôn sanitize phía server trước khi lưu.
- Tên bảng và cột snake\_case, code camelCase. Migration tạo bằng drizzle-kit, không sửa migration đã chạy.
- Lỗi API trả dạng thống nhất `{ error: { code, message } }` với status code đúng để `hc` suy ra type.
- Route Hono viết dạng chain và chia sub-app theo domain (stories, chapters, users, moderation) để giữ type inference nhanh.
- Mỗi service mới có unit test; mỗi luồng chính (đăng ký, viết và đăng chương, đọc chương) có test Playwright.

## 10. Ngoài phạm vi và điểm chừa đường

**Không làm cho tới khi có yêu cầu rõ ràng:** AI Hub, thanh toán, ví, donate, chương trả phí, hội viên, quảng cáo, chat realtime, app mobile, microservices, React Server Components.

**Chỉ chuẩn bị sẵn, không xây tính năng:**

- `stories.is_ai_assisted`: cờ khai báo dùng AI, người đọc lọc được. Chính sách AI Hub sau này: trợ lý cho tác giả, không phải máy viết hộ.
- `core/access.canReadChapter(user, chapter)`: điểm duy nhất quyết định quyền đọc và việc cache công khai. Hiện chỉ kiểm tra chương đã đăng và không bị mod ẩn; sau này paywall cắm vào đây. Mọi nơi trả nội dung chương (trang đọc, API, RSS, sitemap) bắt buộc gọi hàm này.
- `comments.paragraph_id` và `data-pid` trong HTML: sẵn cho bình luận theo đoạn.
- Hono `/api/v1` là contract ổn định: sẵn cho admin riêng hoặc mobile.
- Dữ liệu tiến độ đọc, theo dõi, lịch đăng chương lưu có cấu trúc: là nguồn số liệu cho quyết định kiếm tiền sau này.

## 11. Vận hành

Một VPS, một người vận hành: mất dữ liệu là rủi ro lớn nhất, nên backup có trước khi mở cho người dùng thật.

**Backup và khôi phục**

- Hiện tại: `pg_dump` hằng ngày, nén, lưu vào một thư mục trên chính VPS (ngoài volume của Postgres), giữ 14 bản gần nhất.
- Giới hạn đã biết: backup cùng VPS chỉ cứu được lỗi dữ liệu hoặc thao tác nhầm, không cứu được khi mất VPS hoặc hỏng đĩa.
- Trước khi mở public: đẩy thêm bản sao ra ngoài VPS (bucket R2 riêng, không chung bucket ảnh). Đây là một mục trong checklist Giai đoạn 1.
- Thử restore vào một database tạm ít nhất một lần trước khi mở public, sau đó mỗi tháng một lần.
- Meilisearch không cần backup: dựng lại từ Postgres bằng job reindex của worker.
- Redis bật AOF. Counter chưa ghi dồn có thể mất tối đa 5 phút, chấp nhận được.
- Ảnh trên MinIO tự host: server MinIO đã có script backup file hằng ngày do user vận hành.

**Giám sát**

- Mỗi service trong `docker-compose.yml` có healthcheck; `/api/v1/health` kiểm tra kết nối Postgres và Redis.
- Log ghi ra stdout, xem bằng `docker compose logs`; giới hạn dung lượng log của Docker để không đầy đĩa.
- Một dịch vụ uptime bên ngoài (gói miễn phí) gọi `/api/v1/health` và báo khi sập.

**Bí mật và CI**

- Bí mật chỉ nằm trong `.env` trên VPS, không commit; `.env.example` liệt kê đủ biến kèm mô tả.
- Khi repo lên GitHub: GitHub Actions chạy `pnpm typecheck`, `pnpm lint`, `pnpm test` cho mỗi PR.
