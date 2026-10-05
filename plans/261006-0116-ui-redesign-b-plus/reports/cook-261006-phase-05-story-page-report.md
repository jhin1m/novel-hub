# Cook report: phase 5 trang truyện

Trạng thái: DONE. Phiên cook thứ hai: kiểm lại phần phiên trước đã implement (working tree, chưa commit) theo phase file, sửa 2 điểm code-review còn lại, chạy gate đầy đủ foreground. Gate `typecheck && lint && format:check && test && test:int && test:e2e` xanh (unit 669, int 301 + 1 skip S3, e2e 81).

## File

- Sửa: `routes/stories.$storyKey.index.tsx` (136 dòng, giữ loader/headers/head/`inert`, `bottomInset="cta"`), `routes/stories.$storyKey.chapter-{$number}.tsx` (chỉ chuyển `<MatureGate>` ra ngoài `div.reader-page`), `components/story/story-meta.tsx`, `story-chapter-list.tsx`, `components/library/continue-reading-button.tsx` (`className`/`size`/`showRestart`/`tone`), `library-button.tsx` (`tone`), `components/reader/mature-gate.tsx`, `components/story-cover.tsx`, `lib/format.ts` (+test), `packages/shared/messages/vi.json`, e2e `catalog.spec.ts`, `mobile-navigation.spec.ts`.
- Mới: `components/story/story-hero.tsx` (147), `on-cover-classes.ts`, `story-synopsis.tsx`, `story-author-card.tsx`, `story-sticky-cta.tsx`, `story-meta.test.tsx`, `story-chapter-list.test.tsx`.
- `packages/`: chỉ `messages/vi.json`. Mọi file ≤ 200 dòng.

## Kiểm theo tiêu chí

- `rg font-serif` (route, `components/story`, `mature-gate.tsx`): chỉ `story-synopsis.tsx`.
- `story-hero.tsx` có `tone="on-cover"` cho cả `ContinueReadingButton` và `LibraryButton`.
- `mature-gate.tsx` lớp ngoài giữ `mature-gate fixed inset-0 z-40 … bg-background`, không `/50`, không `bg-black`; route chương: gate ngoài `div.reader-page`.
- e2e mới: màn 18+ che kín trang truyện + chương (`elementFromPoint`, nền đục); CTA dính 360, footer "Điều khoản" bấm được, nút tủ on-cover ở 1280.

## Sửa theo code-review phiên trước

- Medium: link breadcrumb trên hero dùng vòng focus mặc định `--ring`, gần như không thấy trên một số màu bìa → thêm `BREADCRUMB_LINK` (outline 2px `--cover-fg`, offset 2) cho cả 2 link (`story-hero.tsx`).
- Key i18n thừa: `story_page_by` ("Tác giả") hết chỗ dùng sau khi pill tác giả thay dòng "Tác giả …" → xoá khỏi `vi.json`, compile lại Paraglide. Quét toàn bộ `vi.json`: không còn key nào không dùng.

## Quyết định [auto]

- [auto] Test int `apps/worker/src/publishing-worker.int.test.ts` ("a sweep job publishes due chapters and a drain job empties the outbox") đỏ lần chạy gate đầu, chạy riêng file 3 lần: 1 đỏ 2 xanh; chạy lại cả `test:int` xanh. Không sửa. Lý do: phase 5 không đụng worker/core; ngoài phạm vi phase. Giả thuyết (chưa xác minh): job do `registerPublishingSchedulers` ở test trước còn sót trong hàng đợi, `nextCompleted(drain)` resolve theo job drain cũ trước khi job vừa thêm chạy. Phiên trước cũng thấy test này đỏ (khi e2e mồ côi chạy chồng).

## Docs impact

none (phase 12 cập nhật tài liệu).

## Câu hỏi mở

- Có sửa test int publishing-worker chập chờn (chờ đúng job id thay vì theo tên job) trong một fix riêng không?
