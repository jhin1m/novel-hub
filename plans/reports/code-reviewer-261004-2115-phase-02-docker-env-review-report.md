# Code review phase 2: Docker Compose, .env.example, env loader

Ngày: 2026-10-04 · Điểm: 8/10 · Status: DONE_WITH_CONCERNS · Critical: 0

Đạt mọi tiêu chí của phase file. Gate xanh, spec sửa đúng step 7, `index.ts` không re-export `env` (không kéo `node:fs` vào bundle client), compose bind 127.0.0.1 và biến bắt buộc dùng `${VAR:?}`, lỗi env không in giá trị.

## Findings và xử lý

| # | Mức | Vấn đề | Xử lý |
|---|---|---|---|
| H1 | High | `loadServerEnv` throw khi không tìm thấy `pnpm-workspace.yaml` (container production chỉ có bản build, CLI chạy ngoài repo), kể cả khi đã truyền `env` | Đã sửa: không có gốc repo thì bỏ qua file; `findRepoRoot` vẫn throw cho caller cần nó. Có test |
| M1 | Medium | Lỗi `refine`/`superRefine` mất message, chỉ còn `(gốc) (không hợp lệ)` | Đã sửa: issue `custom` in kèm message (do code viết, không chứa input). Có test có/không path |
| M2 | Medium | Truyền `env` nhưng vẫn nạp `.env` vào `process.env` toàn cục, trái doc comment | Đã sửa: truyền `env` thì không nạp file. Có test |
| M3 | Medium | `pg_isready` qua unix socket báo healthy khi server tạm của init script còn chạy → migrate ngay sau `infra:up` có thể lỗi | Đã sửa: `pg_isready -h 127.0.0.1`. Kiểm trên volume trống bằng project compose tạm: DB `_test` có ngay khi `--wait` trả về |
| L1 | Low | `z.url()` nhận mọi scheme (`javascript:`, `mailto:`) | Đã sửa: http(s) cho `APP_URL`, postgres(ql) cho DB, redis(s) cho Redis. Có test |
| L2 | Low | Chưa test nhánh nạp file `.env` | Đã thêm: thư mục gốc tạm + `.env`, xác nhận không ghi đè biến đã đặt (phase 5 e2e dựa vào `SMTP_HOST=''`) |
| L3 | Low | `*_PORT` và URL literal có thể lệch nhau | Giữ nguyên (comment đã ghi rõ); nhắc trong mục "Lệnh" của `CLAUDE.md` khi cập nhật cuối Giai đoạn 0 |
| L4 | Low | Init script cần execute bit | Đang `+x`; kiểm git ghi mode 100755 ở commit đầu |
| L5 | Low | `.env.example` copy nguyên thì `infra:up` lỗi vì `MEILI_MASTER_KEY` rỗng | Đã thêm dòng nhắc ở đầu `.env.example` |

## Hợp đồng cho phase 3–6

- Phase 3 (`dbEnvSchema`, `testEnvSchema`, DB `_test`, `NODE_ENV` không default): khớp.
- Phase 4 (app + db + redis): khớp; H1 đã sửa nên chạy được trong production.
- Phase 5 (biến rỗng = tắt, refine): khớp sau M1.
- Phase 6 (`QUEUE_PREFIX` có `.default()`): khớp, vì biến rỗng thành undefined trước khi áp default.

## Câu hỏi chưa giải quyết

Không có.
