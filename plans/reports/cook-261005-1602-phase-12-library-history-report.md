# Cook — Phase 12: Tủ truyện và lịch sử đọc

Ngày: 2026-10-05 · Plan: `../261004-1654-giai-doan-1-doc-va-viet/phase-12-tu-truyen-lich-su-doc.md` · Status: DONE_WITH_CONCERNS

## Đã làm

- **Shared** `packages/shared/src/schemas/library.ts`: `SHELVES`, `shelfSchema`, `libraryListQuery`, `setShelfInput`, `historyCursorSchema`, `historyQuery`, `publicIdParamSchema`, `LIBRARY_TABS`.
- **Core**:
  - `library/library.ts`: `setShelf` (upsert, giữ `added_at`, 404 truyện không công khai), `removeFromLibrary`, `getShelf`, `listLibrary` (một truy vấn: card + tiến độ + chương đọc tiếp).
  - `reading/continue.ts`: `resumeChapter` (LATERAL, hai lookup `LIMIT 1` theo index), `getContinueReading`.
  - `reading/history.ts`: `listHistory` (keyset `(updated_at, public_id)` theo µs), `removeFromHistory`.
- **API**:
  - `routes/library.ts`: `GET /`, `GET|PUT|DELETE /:publicId`.
  - `routes/reading.ts`: `GET /progress/:publicId`, `GET /history`, `DELETE /history/:publicId`; `bodyLimit` chỉ cho `/progress`, `/view`.
- **Web**:
  - `/library?shelf=reading|plan|done|dropped|history` (`NO_STORE`, `noindex`, khách thấy lời mời đăng nhập);
  - trang truyện có `ContinueReadingButton` và `LibraryButton`; trang chương có `useResumeScroll` (handoff qua `sessionStorage`, không query trên URL);
  - header có link "Tủ truyện" (chỉ icon dưới `sm`); i18n `library_*`, `shelf_*`, `history_*`, `continue_reading`, `layout_library`.
- **Test**:
  - unit: shared schema, core shelves/enum, API 401/400/CSRF/413, `scrollYForPct`, resume handoff;
  - int: core library/history/continue (keyset 45 dòng có trùng và chênh µs), API library + reading;
  - e2e: `apps/web/e2e/library.spec.ts` (4 kịch bản).

## Gate

`pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e` xanh: unit 471, int 242 (+1 skip S3 có sẵn), e2e 57. `pnpm format:check` xanh.

## Review

`code-reviewer-261005-1536-phase-12-library-history-review-report.md`: 8/10, 0 Critical/High.

- Đã sửa:
  - M1: link header chỉ icon trên mobile;
  - M2: thẻ trong tủ/lịch sử có nhãn AI và ngày cập nhật;
  - M3: `resumeChapter` dùng index;
  - L1: test 413 cho `/view` và ghi chú trong comment.
- Chưa sửa (Low):
  - đổi kệ hai lần nhanh khi lần đầu lỗi hiện sai kệ thoáng qua;
  - thao tác tủ/lịch sử lỗi không hiện thông báo;
  - handoff bị dùng hết khi màn 18+ đang hiện;
  - phân trang `/library` tải lại toàn trang;
  - test `getContinueReading` nằm trong `history.int.test.ts`.

## Lệch plan

- Cursor lịch sử dùng micro giây thay mili giây: tránh sót dòng cách nhau dưới 1 ms.
- Không có hàm `resolveReadableChapter` riêng; dùng LATERAL `resumeChapter` để không N+1.
- `use-reading-progress.ts` giữ nguyên; trang chương tắt ghi tiến độ khi đang khôi phục vị trí.
- `bodyLimit` reading chỉ cho route có body: DELETE không body từ trình duyệt làm hono `bodyLimit` lỗi dưới srvx.
- Trang quá số trang của kệ trả về trang cuối.

## Câu hỏi mở

- Header (đã đăng nhập) vốn tràn ngang ở màn 360/390 px từ trước phase này (nút "Viết truyện" + tên tài khoản). Phase 12 không làm tệ hơn nhưng chưa xử lý toàn bộ header.
