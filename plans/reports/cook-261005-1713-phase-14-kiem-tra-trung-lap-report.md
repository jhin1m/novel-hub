# Phase 14 — Kiểm tra trùng lặp: báo cáo cook (2026-10-05)

Plan: `plans/261004-1654-giai-doan-1-doc-va-viet/phase-14-kiem-tra-trung-lap.md` → Completed. Checkbox 11 spec **chưa** đánh (phase 15). Chưa commit.

## Đã làm

- Migration `packages/db/drizzle/0002_dedupe_fingerprints.sql` (drizzle-kit generate): `chapter_fingerprints.lsh_keys int[] NOT NULL DEFAULT '{}'` + GIN, `content_hash text`, partial unique `reports_open_auto_key (target_type, target_id, reason) WHERE status='open' AND reporter_id IS NULL`. Đã `pnpm db:migrate` (dev).
- Shared: `DEDUPE` (`limits.ts`), `CONTENT_JOBS.fingerprintChapter`, `PUBLISHING_JOBS.backfillFingerprints`, `fingerprintChapterPayload`, `duplicateReportDetail` (`queues.ts`).
- Core `packages/core/src/dedupe/`: `hash.ts` (FNV-1a + fmix32, đóng băng), `normalize.ts`, `minhash.ts`, `simhash.ts`, `lsh.ts`, `fingerprint-chapter.ts`, `backfill.ts`; `jobsForChange` thêm `fingerprint-chapter` cho chapter `published`/`updated` (không jobId).
- Worker: `processors/fingerprint-chapter.ts` (route trong `content-router.ts`), `processors/backfill-fingerprints.ts` (publishing worker, scheduler 1 giờ, ≤ 10 lô × 500).
- Test: unit dedupe (chuẩn hoá, độ giống, snapshot hash, 20k chữ < 200 ms), hooks, shared; int `fingerprint-chapter.int.test.ts`, `backfill-fingerprints.int.test.ts`, schema (GIN qua EXPLAIN, partial unique), outbox, scheduler.

## Quyết định lệch nhẹ so với văn bản phase (đã được reviewer xác nhận đúng)

1. Không bọc transaction: fingerprint commit trước khi truy vấn ứng viên → hai bản copy đăng cùng lúc không bỏ sót nhau.
2. Báo cáo đặt trên chương đăng **sau** của cặp (hoà → id lớn hơn) → kiểm theo chiều nào cũng cùng target.
3. Mỗi lượt chèn một báo cáo cho mỗi target (khớp tốt nhất chưa `dismissed`) — sửa finding H1 của review (thứ tự kiểm làm sót bản copy).
4. Chuẩn hoá bỏ `\p{Cf}` và dùng NFKC (spec ghi NFC; NFKC bao NFC, chặn né bằng zero-width/fullwidth) — sửa M1 trước khi đóng băng.
5. Ứng viên sắp theo số band key trùng trước `LIMIT 200` (L1).

## Kiểm chứng

- Gate: `pnpm typecheck` ✓, `pnpm lint` ✓, `pnpm format:check` ✓, `pnpm test` 562 ✓, `pnpm test:int` 267 ✓ (S3 skip, chưa cấu hình), `pnpm test:e2e` 62 ✓.
- Smoke worker thật trên DB dev: backfill xếp 5 chương seed; tác giả khác đăng bản copy qua `publishChapter` → outbox → `fingerprint-chapter` → đúng 1 dòng `reports` `duplicate`, `reporter_id` null, jaccard 1, hamming 0. Đã xoá dữ liệu smoke và fingerprint seed (backfill tự tính lại khi worker chạy).
- Review: `plans/reports/code-reviewer-261005-1713-phase-14-dedupe-review-report.md` (7/10 trước khi sửa; H1, M1, M2, L1–L4 đã xử lý).

## Còn lại / chấp nhận

- L5: chương có job luôn lỗi bị xếp lại mỗi giờ; backfill bắt đầu lại từ id đầu → 5.000 chương lỗi vĩnh viễn có thể chặn phần sau. Chấp nhận (processor chỉ dùng Postgres, khó lỗi vĩnh viễn).
- L7: ngưỡng 200 ms giữ nguyên theo NFR; có thể flaky trên CI chậm.
- Giới hạn đã biết (ghi vào docs mod ở phase 15): sửa rải đều 1/10 số từ → Jaccard ~0,33, không bắt được; copy nửa chương cũng vậy.

## Câu hỏi cho phase 15

- Trạng thái nào ngoài `dismissed` (vd. `resolved`) chặn tạo lại báo cáo cùng cặp?
- Không thêm trạng thái "chưa xử lý" nào khác `open` (partial index giả định vậy).
