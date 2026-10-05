# Cook report: phase 4 trang chủ

Trạng thái: DONE. Gate `typecheck && lint && format:check && test && test:int && test:e2e` xanh (unit 661, int 301 + 1 skip S3, e2e 78). Sau sửa a11y chạy lại e2e: 78 pass.

## File

- Sửa: `apps/web/src/routes/index.tsx` (thân mới, giữ loader/headers/head), `components/library/continue-reading-button.tsx` (`ResumeLink className?`), `packages/shared/messages/vi.json` (+6 key `home_*`), `apps/web/e2e/catalog.spec.ts`.
- Mới: `components/home/home-genre-chips.tsx`, `home-featured-hero.tsx`, `home-continue-reading.tsx`, `lib/home.ts` + `lib/home.test.ts`.
- Không đụng `packages/core`, `packages/api`, `server-fns/`. Không `font-serif`. Mọi file ≤ 91 dòng.

## Quyết định [auto]

- [auto] e2e "Đọc tiếp" đổi thứ tự so với ma trận: lưu tiến độ khi 18+ tắt (mặc định) → kiểm không lộ 18+ → `allowMatureContent` → kiểm 18+ hiện. Lý do: lưu tiến độ không cần 18+ (`core/reading/progress.ts`), đơn giản hơn và kiểm cả hai nhánh.
- [auto] Link "Tủ truyện" trong khối "Đọc tiếp" dùng `Link to="/library" search={{ shelf: 'reading', page: 1 }}` như header/thanh tab. Lý do: theo pattern sẵn có.
- [auto] Thêm assert SSR không chứa `id="continue-title"` trong test HTML. Lý do: tiêu chí "HTML không chứa khối Đọc tiếp".
- [auto] Áp 2 góp ý a11y của code-reviewer: nút "Xem truyện" dùng outline có offset thay ring trùng màu nút; `ul` chip `-m-1 p-1` để vòng focus không bị cắt khi `overflow-x-auto`. Lý do: vấn đề thật, sửa chỉ class.

## Review (tóm tắt)

Đạt mọi tiêu chí; không lệch hydration, không trùng accessible name ở strict mode, không đổi contract. Tương phản hero: `--cover-fg` trên `--cover-N` thấp nhất 5.02:1. Nitpick bỏ qua: link tiêu đề hero chỉ gạch chân khi focus; hero có 2 link cùng URL (spec yêu cầu).

Docs impact: none (phase 12 cập nhật tài liệu).

## Câu hỏi mở

Không.
