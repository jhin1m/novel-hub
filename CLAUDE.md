# Novel Hub

Nền tảng truyện chữ sáng tác gốc tiếng Việt. Toàn bộ yêu cầu, stack, schema, giai đoạn và quy ước nằm trong spec dưới đây; spec là nguồn chuẩn, file này chỉ bổ sung cách làm việc.

@docs/project-spec.md

## Lưu ý ngữ cảnh

- Dự án này là **TypeScript monorepo** (TanStack Start, Hono, Drizzle, Better Auth). Mọi mô tả về Laravel, Livewire, PHP, "MyManga VN" từ CLAUDE.md toàn cục **không áp dụng** ở đây.
- Spec mâu thuẫn với chỉ dẫn khác thì theo spec; spec thiếu hoặc mơ hồ thì hỏi, không tự đoán.

## Cách làm việc

- Mỗi lần làm đúng **một checkbox** trong mục 5 của spec, theo thứ tự, không nhảy giai đoạn.
- Luồng chuẩn: `/ak:plan` cho cả giai đoạn (mỗi checkbox một phase) → `/ak:cook <phase-file>` → `/ak:test` → `/ak:code-review`.
- Chưa xanh `pnpm typecheck`, `pnpm lint`, `pnpm test` thì chưa xong (thêm migration nếu đổi schema).
- Không commit/push, không đổi config (Docker, env, CI, Cloudflare), không thêm dependency ngoài mục 2 khi chưa được đồng ý.
- Plan lưu ở `plans/`, tài liệu ở `docs/`. Hoàn thành một checkbox thì đánh dấu `[x]` trong spec.

### Vòng làm việc và nhắc bước tiếp theo

Vòng lặp cho mỗi giai đoạn:

1. `/ak:plan --deep docs/project-spec.md` → plan cho giai đoạn đầu tiên còn checkbox chưa xong, lưu ở `plans/<timestamp>-giai-doan-<N>-<slug>/`.
2. `/ak:plan validate <plan-dir>` → trả lời các câu hỏi mở trong `plan.md`.
3. Với từng phase theo thứ tự: `/clear` → `/ak:cook <plan-dir>/phase-XX-*.md` → gate xanh → đánh `[x]` checkbox tương ứng trong spec.
4. Hết checkbox của giai đoạn → quay lại bước 1 cho giai đoạn kế tiếp.

Xác định vị trí hiện tại: checkbox đầu tiên chưa `[x]` trong mục 5 của spec, và thư mục plan mới nhất trong `plans/` (`ak plan status <plan-dir>`).

Claude luôn nói rõ **một lệnh tiếp theo** cho user, cụ thể:
- Đầu session, hoặc khi user hỏi "làm gì tiếp" / "đang ở đâu": báo giai đoạn, phase hiện tại và lệnh cần chạy.
- Plan đã có nhưng chưa có `## Validation Log` trong `plan.md`: nhắc chạy validate trước khi cook.
- Xong một phase: đưa lệnh `/ak:cook` cho phase kế tiếp, kèm đường dẫn tuyệt đối.
- Xong checkbox cuối của một giai đoạn: nhắc chạy `/ak:plan --deep docs/project-spec.md` cho giai đoạn kế tiếp. Không tự lên plan khi user chưa yêu cầu.

## Quy chuẩn code

- Nguồn chuẩn: `docs/code-standards.md`. Tóm tắt: mọi thứ trong code là tiếng Anh (tên file kể cả file route, URL, identifier, key i18n, DB, comment, tên test, commit); tiếng Việt chỉ ở chuỗi hiển thị qua Paraglide, slug nội dung và `docs/`/`plans/`.

## Thiết kế

- Nguồn chuẩn: `docs/design-guidelines.md` (link Design System và mockup) và file tokens trong `apps/web/src/styles/`. Chưa có thì không tự bịa màu, font; theo mục 8 của spec.

## Lệnh

Chạy ở gốc repo. Lần đầu: `cp .env.example .env`, điền `MEILI_MASTER_KEY`, `BETTER_AUTH_SECRET`, `SEED_USER_PASSWORD`, rồi `pnpm install` (tự compile Paraglide); sau `pnpm infra:up` điền `MEILI_SEARCH_KEY` (cách lấy ghi trong `.env.example`).

| Lệnh | Việc |
| --- | --- |
| `pnpm infra:up` / `infra:down` / `infra:logs` | Postgres, Redis, Meilisearch bằng Docker Compose |
| `pnpm db:migrate` | Chạy migration Drizzle |
| `pnpm db:generate` | Sinh migration mới sau khi đổi schema |
| `pnpm db:seed` | Dữ liệu mẫu (chỉ DB localhost, `NODE_ENV` tường minh); seed không ghi index tìm kiếm, chạy `pnpm search:reindex` sau đó |
| `pnpm db:seed-tags` | Nạp danh sách tag ban đầu (idempotent, chạy được ở production) |
| `pnpm cdn:purge -- --story <publicId>` | Purge Cloudflare trang truyện + mọi chương từng đăng (cần `CF_*`) |
| `pnpm search:reindex` | Dựng lại dữ liệu index Meilisearch (truyện, tác giả) từ Postgres; chạy sau khi restore DB, seed, hoặc khi dữ liệu index lệch (cần `MEILI_MASTER_KEY`). Cấu hình index (filter, sort, typo) worker tự áp mỗi lần khởi động, deploy đổi cấu hình không cần reindex |
| `pnpm dev` | Web (http://localhost:3000) và worker chạy song song; link xác thực/đặt lại mật khẩu ở dev in ra log **worker** |
| `pnpm --filter @novel-hub/worker dev` / `start` | Chỉ worker (`tsx watch` / `tsx`) |
| `pnpm --filter @novel-hub/web build` | Build web (Nitro, ra `apps/web/.output`) |
| `pnpm i18n:compile` | Compile lại Paraglide sau khi sửa `packages/shared/messages/vi.json` |
| `pnpm typecheck` / `lint` / `format` / `format:check` | Kiểm tra type, ESLint, Prettier |
| `pnpm test` | Unit test, không cần Docker |
| `pnpm test:int` | Integration trên Postgres/Redis thật (`TEST_DATABASE_URL`, `TEST_REDIS_URL`) |
| `pnpm test:e2e` | Playwright, port 3100, DB và Redis test |

Gate trước khi xong một phase: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e`.

Đổi `*_PORT` trong `.env` thì phải sửa cả URL viết literal tương ứng (`DATABASE_URL`, `REDIS_URL`, `MEILI_URL`, ...) vì Node không nội suy `${VAR}`.
