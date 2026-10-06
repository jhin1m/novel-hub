# Quy chuẩn code

Bổ sung cho mục 9 của `docs/project-spec.md`. Hai nơi lệch nhau thì spec là chuẩn, trừ phần ngôn ngữ và đặt tên dưới đây (user chốt 2026-10-05).

## 1. Ngôn ngữ

**Mọi thứ trong code là tiếng Anh. Tiếng Việt chỉ xuất hiện ở chuỗi hiển thị (qua i18n), nội dung người dùng và tài liệu.**

| Thứ | Ngôn ngữ | Ghi chú |
| --- | --- | --- |
| Tên file, thư mục (kể cả file route) | Tiếng Anh | |
| URL công khai | Tiếng Anh | Bảng ở mục 3 |
| Identifier (biến, hàm, type, component) | Tiếng Anh | |
| Key i18n | Tiếng Anh | Giá trị là tiếng Việt |
| Bảng, cột, enum DB | Tiếng Anh | |
| Mã lỗi API (`error.code`) | Tiếng Anh | `message` cho người dùng đi qua i18n |
| Comment, JSDoc | Tiếng Anh | Code cũ còn comment tiếng Việt: dịch khi phase nào sửa tới file đó, không dịch hàng loạt |
| Tên test (`describe`/`it`/`test`) | Tiếng Anh | Như comment |
| Commit message | Tiếng Anh | Conventional Commits |
| Chuỗi hiển thị | Tiếng Việt | Không hardcode, luôn qua Paraglide `m.*()` |
| Slug nội dung (truyện, tag) | Tiếng Việt không dấu | Sinh từ tiêu đề bằng `slugify` (`packages/shared/src/slug.ts`), là dữ liệu, không phải code |
| `docs/`, `plans/` | Tiếng Việt | Đường dẫn, tên file, identifier trong đó vẫn tiếng Anh |

## 2. Đặt tên

| Thứ | Quy ước | Ví dụ |
| --- | --- | --- |
| File TS/TSX | kebab-case | `auth-errors.ts`, `site-layout.tsx` |
| File route TanStack | Theo URL, tiếng Anh, kebab-case; tham số `$name` | `sign-up.tsx`, `stories.$storyKey.index.tsx` |
| Component React | PascalCase | `SiteLayout`, `SignUpPage` |
| Hàm, biến | camelCase | `meQueryKey`, `canReadChapter` |
| Hằng toàn cục | UPPER_SNAKE_CASE | `LIMITS`, `BOOT_SCRIPT` |
| Bảng, cột DB | snake_case | `chapter_drafts.updated_at` |
| Key i18n | snake_case, tiền tố theo khu vực | `auth_password`, `sign_up_title`, `layout_sign_in` |
| Mã lỗi API | UPPER_SNAKE_CASE | `DRAFT_CONFLICT`, `STORAGE_UNAVAILABLE` |
| Unit test | `*.test.ts(x)` cạnh file nguồn | `slug.test.ts` |
| Integration test (Postgres/Redis thật) | `*.int.test.ts` | `auth.int.test.ts` |
| E2E | `apps/web/e2e/*.spec.ts` | `auth.spec.ts` |

## 3. URL công khai

URL và tên file route cùng là tiếng Anh, vì TanStack Router sinh URL từ tên file. Không dùng virtual file routes để map URL khác tên file.

| Trang | URL | File route (`apps/web/src/routes/`) |
| --- | --- | --- |
| Trang chủ | `/` | `index.tsx` |
| Đăng ký / đăng nhập | `/sign-up`, `/sign-in` | `sign-up.tsx`, `sign-in.tsx` |
| Quên / đặt lại mật khẩu | `/forgot-password`, `/reset-password` | `forgot-password.tsx`, `reset-password.tsx` |
| Truyện | `/stories/{slug}-{publicId}` | `stories.$storyKey.index.tsx` |
| Chương | `/stories/{slug}-{publicId}/chapter-{number}` | `stories.$storyKey.chapter-{$number}.tsx` |
| Tác giả | `/authors/{username}` | `authors.$username.tsx` |
| Tag | `/tags/{tagSlug}` | `tags.$tagSlug.tsx` |
| Tìm kiếm | `/search?q=...` | `search.tsx` |
| Bảng xếp hạng | `/rankings/{day\|week\|month\|rising}` (`/rankings` → 301 `/rankings/week`) | `rankings.$period.tsx`, `rankings.index.tsx` |
| Tủ truyện | `/library` | `library.tsx` |
| Thông báo | `/notifications` | `notifications.tsx` |
| Cài đặt | `/settings` | `settings.tsx` |
| Khu viết | `/write`, `/write/stories/new`, `/write/stories/{publicId}`, `/write/stories/{publicId}/chapters/{number}` | `write/...` |
| Hàng chờ mod | `/moderation` | `moderation.tsx` |
| Điều khoản, quy định nội dung | `/terms`, `/content-policy` | `terms.tsx`, `content-policy.tsx` |
| API | `/api/v1/*` | `api/$.ts` (mount Hono) |

- Tên và giá trị query luôn tiếng Anh: phân trang `page`, tủ truyện `?shelf=reading|plan|done|dropped|history`.
- Mọi URL công khai dựng qua một hàm `canonicalPath()` ở `packages/shared`; không nối chuỗi URL rải rác.

## 4. Cấu trúc và ranh giới

- Logic nghiệp vụ ở `packages/core`, nhóm theo domain (`users/`, `policies/`, `queue/`...). Route Hono, server function, worker chỉ validate, kiểm quyền, rồi gọi `core`.
- Quyền ghi qua `core/policies`, quyền đọc chương qua `core/access.canReadChapter()`.
- Schema Zod, hằng giới hạn (`LIMITS`), kiểu dùng chung đặt ở `packages/shared`, dùng chung cho API và form.
- Web không import `@novel-hub/core`/`@novel-hub/db` trực tiếp, trừ trong `src/server/`, `src/routes/api/` và file test (ESLint `no-restricted-imports` chặn; `src/server-fns/` được miễn khi bắt đầu có server function). Không thêm block ESLint thứ hai, mở rộng block hiện có.
- Hono: route viết dạng chain, mỗi domain một sub-app; lỗi trả `{ error: { code, message } }` với status đúng.

## 5. TypeScript và chất lượng

- `strict`, không `any`, không `@ts-ignore`. Input từ ngoài luôn parse bằng Zod.
- Không để lại code chết, `console.log` gỡ lỗi, hay TODO không có lý do.
- Comment giải thích **vì sao**, không kể lại code làm gì. Không ghi số phase, mã finding, mã plan vào comment, tên test hay commit.
- Gate trước khi xong một việc: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e`.
