---
phase: 14
title: "Phase 14: Kiểm tra trùng lặp"
status: completed
priority: P1
effort: "1.5d"
dependencies: [13]
---

# Phase 14: Kiểm tra trùng lặp

Spec checkbox: `Kiểm tra trùng lặp khi đăng chương, báo cáo vi phạm, trang hàng chờ cho mod (mục 7).` — phase này làm **phần 1/2** (kiểm tra trùng lặp); báo cáo và hàng chờ mod ở phase 15. **Không** đánh `[x]` checkbox ở phase này. <!-- Red Team: tách phase -->

## Context Links

- Spec mục 7 (kiểm tra trùng lặp 4 bước: chuẩn hoá, MinHash/SimHash, so kho loại cùng tác giả, vượt ngưỡng tạo `report`, không tự ẩn), mục 4 (`chapter_fingerprints`, `reports`)
- [plan.md](./plan.md) — "Trùng lặp", "Outbox và hàng đợi" (không `jobId` cố định, processor idempotent)
- `plans/reports/researcher-261004-2352-editor-content-pipeline-report.md` mục 6 (thuật toán, SQL ứng viên)
- Code (đã kiểm 2026-10-05):
  - `packages/db/src/schema/chapters.ts:84-90` (`chapterFingerprints`: `chapterId` PK, `minhash integer[]`, `simhash bigint`; chưa có `lsh_keys`)
  - `packages/db/src/schema/moderation.ts:8-27` (`reports`: `reporter_id` nullable, `status` text mặc định `open`, index `reports_target_idx`)
  - `packages/db/src/schema/chapters.ts:42` (`chapters_story_id_status_number_idx`)
  - `packages/core/src/queue/job-options.ts:8-13` (`DEFAULT_JOB_OPTIONS`: 5 lần thử, lỗi giữ 7 ngày)
  - `packages/db/drizzle/` (mới có `0000_init.sql`; phase 5 thêm `0001_content_events`; phase này thêm `0002`)
- Phase 4: `docToText`; phase 5: `recordContentChanges(tx, changes)`, `jobsForChange(change)`, `ContentChange` (chapter có `contentHash?`), queue `content` + `CONTENT_JOBS`, queue `publishing` + `PUBLISHING_JOBS` + `registerPublishingSchedulers` (`apps/worker/src/publishing-worker.ts`), `apps/worker/src/content-router.ts#routeContentJob`, `ContentJobDeps`.

## Overview

- Migration: `chapter_fingerprints.lsh_keys integer[]` + GIN, `chapter_fingerprints.content_hash text`, partial unique index báo cáo tự động đang mở.
- Core `dedupe` (hàm thuần) + `fingerprintChapter(db, chapterId)`.
- Job `fingerprint-chapter` sinh từ `jobsForChange` khi chương `published`/`updated` (outbox của phase 5) → so khớp → `report` tự động lý do `duplicate`; không tự ẩn. <!-- Red Team: outbox -->
- Job scheduler `backfill-fingerprints` trên queue `publishing` (việc nội bộ định kỳ, như sweeper/drain của phase 5) xếp job `fingerprint-chapter` vào queue `content` cho chương đã đăng thiếu fingerprint hoặc fingerprint cũ. <!-- Red Team: backfill; consistency sweep — job định kỳ ở PUBLISHING_JOBS, CONTENT_JOBS chỉ thêm fingerprint-chapter -->

## Key Insights

- **Không `jobId` cố định** (quy tắc phase 5). Idempotent nhờ: (1) processor đọc trạng thái hiện tại; fingerprint đã khớp `content_hash` hiện tại thì chỉ so lại, không tính lại; (2) partial unique index `reports(target_type, target_id, reason) WHERE status = 'open' AND reporter_id IS NULL` + `INSERT … ON CONFLICT DO NOTHING` → chạy hai lần, hai job song song vẫn chỉ một báo cáo mở. <!-- Red Team: jobId -->
- Backfill cần biết fingerprint còn đúng nội dung không → lưu `content_hash` (lấy từ `chapter_contents.content_hash` lúc tính). Truy vấn backfill: chương `published`, `deleted_at IS NULL`, `f.chapter_id IS NULL OR f.content_hash IS DISTINCT FROM cc.content_hash`. Bù cả job thất bại hết lượt thử, chương có trước phase này (seed), và Redis mất job.
- Fingerprint tính từ `chapter_contents.doc_json` qua `docToText` (phase 4) — tương đương "bỏ HTML" của spec.
- LSH 16×8: J = 0,8 → ~95% thành ứng viên, J = 0,5 → ~6%. Lọc cuối bằng Jaccard ước lượng ≥ 0,7. SimHash chỉ tính Hamming trong JS cho ứng viên, lưu vào `detail` làm tín hiệu phụ.
- Copy nửa chương (J ~0,3) không bắt được — giới hạn đã biết, ghi vào docs mod (phase 15).
- Ứng viên không lọc tác giả bị ban: bản gốc của người bị ban vẫn có thể bị người khác copy; không tự ẩn nên không hại.
- Không lộ UUID: `detail` lưu `matchedChapterId` nội bộ; phase 15 dịch sang `publicId`/`number` trước khi trả API mod.

## Requirements

**Functional**

1. Chuẩn hoá: bỏ cấu trúc (qua `docToText`), NFC, lowercase, `[^\p{L}\p{M}\p{N}\s]+` → khoảng trắng, tách theo khoảng trắng; shingle 5 từ, bỏ trùng bằng `Set`.
2. MinHash 128 (FNV-1a 32-bit + fmix, double hashing), SimHash 64-bit có dấu (`BigInt.asIntN(64)`), `lshKeys` 16 band × 8 hàng (`h32(band.join(','), bandIndex) | 0`). Upsert `chapter_fingerprints` kèm `content_hash`.
3. Ứng viên: `lsh_keys && $keys`, chương `published`, `deleted_at IS NULL`, khác chính nó, truyện của **tác giả khác**; `LIMIT 200`. Chọn ứng viên Jaccard ước lượng cao nhất.
4. Jaccard ≥ 0,7 → `INSERT INTO reports (reporter_id NULL, target_type 'chapter', target_id, reason 'duplicate', detail JSON { matchedChapterId, jaccard, hamming }) ON CONFLICT DO NOTHING`. Không ẩn.
   - Mod đã `dismissed` một báo cáo `duplicate` của chương này với cùng `matchedChapterId` → không tạo lại (đăng lại có sửa nhẹ không làm phiền mod lần nữa).
- Chương không còn `published` hoặc đã xoá mềm khi job chạy → `skipped`. Ít hơn 20 shingle → chỉ lưu fingerprint, không so.
- `jobsForChange`: `{ entity: 'chapter', action: 'published' | 'updated' }` → `{ name: CONTENT_JOBS.fingerprintChapter, data: { chapterId } }`; các action khác → không job fingerprint.
- Backfill: scheduler mỗi giờ trên queue `publishing`, mỗi lượt tối đa 10 lô × 500 chương (keyset theo `chapters.id`), mỗi lô `addBulk` job `fingerprint-chapter` vào queue `content`.

**Non-functional**

- Fingerprint chương 20.000 chữ < 200 ms; truy vấn ứng viên dùng GIN.
- Hàm hash đóng băng (đổi = fingerprint cũ vô nghĩa): snapshot test + comment.
- Processor không gọi mạng ngoài (chỉ Postgres).

## Architecture

```
publishChapter / sweeper (phase 5) ── tx: … recordContentChanges(tx, [{ entity:'chapter', action:'published', chapterId, contentHash }])
worker drain-content-events ─▶ jobsForChange → 'fingerprint-chapter' { chapterId }   (không jobId)
worker[publishing] scheduler backfill-fingerprints (1h) ─▶ listChaptersNeedingFingerprint(db, 500, afterId) ×≤10 ─▶ contentQueue.addBulk 'fingerprint-chapter'
worker[content] routeContentJob ─▶ processFingerprintChapter ─▶ core.fingerprintChapter(db, chapterId)
   load chapter + content (published, chưa xoá?) → fp hiện có cùng content_hash? dùng lại : tính mới
   tx: upsert fingerprint → ứng viên (GIN &&, tác giả khác, LIMIT 200) → best Jaccard ≥ 0.7
       → INSERT report … ON CONFLICT DO NOTHING
```

```ts
// packages/shared/src/limits.ts (phase 2) thêm
export const DEDUPE = { shingle: 5, perms: 128, bands: 16, rows: 8, jaccard: 0.7,
  minShingles: 20, maxCandidates: 200, backfillBatch: 500 } as const;
// packages/shared/src/queues.ts thêm
CONTENT_JOBS.fingerprintChapter = 'fingerprint-chapter'; PUBLISHING_JOBS.backfillFingerprints = 'backfill-fingerprints';
export const fingerprintChapterPayload: z.ZodType<{ chapterId: string }>;
export const duplicateReportDetail: z.ZodType<{ matchedChapterId: string; jaccard: number; hamming: number }>; // phase 15 parse

// packages/core/src/dedupe/*.ts (thuần)
export function normalizeForDedupe(text: string): string[];
export function shingles(tokens: string[], k?: number): Set<string>;
export function minhash(sh: Set<string>, n?: number): Int32Array;
export function simhash(sh: Set<string>): bigint;
export function lshKeys(mh: Int32Array, bands?: number, rows?: number): number[];
export function jaccardEstimate(a: ArrayLike<number>, b: ArrayLike<number>): number;
export function hamming64(a: bigint, b: bigint): number;
// packages/core/src/dedupe/fingerprint-chapter.ts
export type FingerprintResult = { status: 'skipped' | 'stored' | 'reported' | 'already_reported'; bestJaccard: number | null };
export function fingerprintChapter(db: Db, chapterId: string): Promise<FingerprintResult>;
export function listChaptersNeedingFingerprint(db: Db, limit: number, afterId?: string): Promise<string[]>;
```

## File Inventory

| File | Action | Ghi chú |
|---|---|---|
| `packages/db/src/schema/chapters.ts` | modify | `lshKeys: integer().array().notNull().default(sql\`'{}'\`)`, `contentHash: text()`, `index('chapter_fingerprints_lsh_keys_idx').using('gin', t.lshKeys)` |
| `packages/db/src/schema/moderation.ts` | modify | `uniqueIndex('reports_open_auto_key').on(t.targetType, t.targetId, t.reason).where(sql\`status = 'open' AND reporter_id IS NULL\`)` |
| `packages/db/drizzle/0002_dedupe_fingerprints.sql` + `meta/*` | generate | `pnpm --filter @novel-hub/db db:generate --name dedupe_fingerprints`; kiểm SQL có `USING gin`, `WHERE` của partial index |
| `packages/db/src/schema.int.test.ts` | modify | GIN tồn tại, `&&` dùng index (`EXPLAIN`); insert báo cáo tự động mở trùng → conflict |
| `packages/shared/src/limits.ts`, `queues.ts` (+ test) | modify | `DEDUPE`, tên job, payload, `duplicateReportDetail` |
| `packages/core/src/dedupe/{normalize,minhash,simhash,lsh}.ts` (+ `.test.ts`) | create | thuần |
| `packages/core/src/dedupe/{fingerprint-chapter,backfill}.ts` (+ `fingerprint-chapter.int.test.ts`) | create | |
| `packages/core/src/content/hooks.ts` (+ test) | modify | `jobsForChange` thêm `fingerprint-chapter` |
| `packages/core/src/index.ts` | modify | export |
| `apps/worker/src/processors/{fingerprint-chapter,backfill-fingerprints}.ts` (+ test) | create | parse payload bằng Zod, gọi core |
| `apps/worker/src/content-router.ts` (phase 5) | modify | route `fingerprint-chapter` |
| `apps/worker/src/publishing-worker.ts` (phase 5) | modify | route `backfill-fingerprints` (dùng `contentQueue` sẵn có trong deps); `registerPublishingSchedulers` thêm `upsertJobScheduler('backfill-fingerprints', { every: 3_600_000 })` |

Không có UI, không env mới, không dependency mới.

## Implementation Steps

1. **Migration:** sửa schema, `pnpm --filter @novel-hub/db db:generate --name dedupe_fingerprints` (ra `0002_dedupe_fingerprints.sql`), đọc SQL (một `ALTER TABLE chapter_fingerprints ADD COLUMN lsh_keys integer[] DEFAULT '{}' NOT NULL`, `ADD COLUMN content_hash text`, `CREATE INDEX … USING gin`, `CREATE UNIQUE INDEX … WHERE …`), `pnpm db:migrate`. Không sửa migration cũ.
2. **Shared:** `DEDUPE`, tên job, payload, `duplicateReportDetail`.
3. **Dedupe thuần** + unit test văn bản tiếng Việt có dấu; snapshot `lshKeys`/`minhash` với input cố định; comment đóng băng hàm hash (giải thích bất biến, không mã phase).
4. **`fingerprintChapter`:** đọc chương + `chapter_contents` + `author_id`; không đọc được (`status <> 'published'` hoặc `deleted_at`) → `skipped`. Fingerprint có `content_hash` trùng → dùng lại `minhash`/`lsh_keys`, ngược lại tính mới. Transaction: upsert fingerprint; truy vấn ứng viên (SQL research mục 6 + `LIMIT`, join `stories` để loại `author_id` trùng); tính Jaccard/Hamming; ≥ ngưỡng và chưa có bản `dismissed` cùng cặp → insert `ON CONFLICT DO NOTHING`, phân biệt `reported`/`already_reported` theo `rowCount`.
5. **Backfill:** `listChaptersNeedingFingerprint` theo Key Insights (keyset `id > afterId`, `LIMIT`); processor `backfill-fingerprints` (queue `publishing`) lặp tối đa 10 lô trong một lượt, mỗi lô `contentQueue.addBulk` (không jobId), dừng khi lô không đầy; lượt sau (1 giờ) bắt đầu lại từ đầu keyset.
6. **`jobsForChange`:** thêm nhánh chapter `published`/`updated`; unit test bảng ánh xạ (chapter `deleted`/`hidden`, story, user → không có fingerprint).
7. **Worker:** processor parse payload, gọi core, log `status`; `fingerprint-chapter` qua `content-router.ts`, `backfill-fingerprints` qua publishing worker; scheduler thêm vào `registerPublishingSchedulers` (idempotent).
8. **Smoke thủ công** với worker chạy (`pnpm dev`): tác giả A đăng chương, tác giả B đăng chương copy → sau ≤ 1 phút có dòng `reports` reason `duplicate`, `reporter_id` null (xem bằng `psql`); xoá dòng `chapter_fingerprints` của B → trong ≤ 1 giờ (hoặc gọi job tay) được tính lại, không thêm báo cáo trùng.
9. Gate: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e`. **Không** đánh `[x]` checkbox 11 (phase 15 đánh).

## Function / Interface Checklist

- [x] `normalizeForDedupe`, `shingles`, `minhash`, `simhash`, `lshKeys`, `jaccardEstimate`, `hamming64`
- [x] `fingerprintChapter(db, chapterId)`, `listChaptersNeedingFingerprint(db, limit, afterId?)`
- [x] `processFingerprintChapter`, `processBackfillFingerprints`
- [x] `jobsForChange` nhánh fingerprint; `DEDUPE`, `fingerprintChapterPayload`, `duplicateReportDetail`
- [x] Migration `0002_dedupe_fingerprints`: `lsh_keys` + GIN, `content_hash`, `reports_open_auto_key`

## Test Scenario Matrix

| Mức | Kịch bản | Loại |
|---|---|---|
| Critical | Hai văn bản giống 100% → Jaccard ≈ 1, Hamming ≤ 3; khác hoàn toàn → Jaccard < 0,1; sửa 10% từ → Jaccard ≥ 0,7 | unit |
| High | Chuẩn hoá: "Kiếm  Đạo," và "kiếm đạo" cùng token; NFD → NFC | unit |
| High | `lshKeys` ổn định (snapshot); `simhash` nằm trong int64 có dấu | unit |
| Critical | Chương B (tác giả khác) copy chương A → đúng một báo cáo `duplicate`, kể cả chạy job hai lần và hai lần song song (`Promise.all`) | int `fingerprint-chapter.int.test.ts` |
| Critical | Cùng tác giả, nội dung trùng → không báo cáo; chương xoá mềm không là ứng viên | int |
| High | Chương không còn `published` khi job chạy → `skipped`, không ghi fingerprint | int |
| High | Báo cáo cũ `dismissed` cùng cặp chương → đăng lại không tạo báo cáo; khớp với chương khác → tạo báo cáo mới (partial index chỉ chặn bản `open`) | int |
| High | `listChaptersNeedingFingerprint`: trả chương thiếu fingerprint và chương có `content_hash` lệch; bỏ chương fingerprint khớp, chương draft/xoá mềm | int |
| High | `jobsForChange`: chapter `published`/`updated` → có job `fingerprint-chapter` không `jobId`; action khác → không | unit |
| Medium | Fingerprint chương 20.000 chữ < 200 ms | unit (đo, ngưỡng rộng) |
| Medium | Worker thật: hai chương giống nhau → dòng `reports` xuất hiện | thủ công (bước 8) |

## Dependency Map

- Cần: phase 4 (`docToText`), phase 5 (outbox `recordContentChanges`, `jobsForChange`, `content-router`, `publishing-worker` + `registerPublishingSchedulers`, `chapter_contents.content_hash`), phase 13 (không trực tiếp; giữ thứ tự).
- Phase 15 dùng: báo cáo `duplicate` (`reporter_id` null, `duplicateReportDetail`) để hiển thị trong hàng chờ mod; đánh `[x]` checkbox 11.
- Phase 17: migration của phase này nằm trong bản dump (đếm `_journal.json`).

## Success Criteria

- [x] Đăng chương copy của tác giả khác → có đúng một báo cáo `duplicate` tự động, chương không bị ẩn
- [x] Chương đã đăng thiếu hoặc lệch fingerprint được backfill trong ≤ 1 giờ
- [x] Job không đặt `jobId`; chạy lặp/song song không sinh báo cáo trùng
- [x] Migration đã chạy; gate xanh; checkbox 11 **chưa** đánh

## Risk Assessment

| Rủi ro | Khả năng × Tác động | Giảm thiểu |
|---|---|---|
| Văn mẫu chung (lời mở đầu, cảnh báo) gây báo cáo giả | TB × Thấp | Loại cùng tác giả, ngưỡng 0,7 toàn chương, không tự ẩn |
| Đổi hàm hash làm fingerprint cũ vô dụng | Thấp × TB | Đóng băng + snapshot; cần đổi thì xoá bảng, backfill tự tính lại |
| Backfill lần đầu (seed lớn) dồn queue | Thấp × Thấp | Lô 500, tối đa 10 lô/lượt; processor chỉ dùng Postgres |
| Kẻ xấu đăng bản copy trước để hạ truyện gốc | Thấp × TB | Không tự ẩn; mod xem cả hai chương (phase 15) |
| Ứng viên phổ biến (đoạn ngắn lặp) làm truy vấn chậm | Thấp × Thấp | `LIMIT 200`, chỉ so khi ≥ 20 shingle |

Rollback: migration chỉ thêm cột có default, cột nullable và index — để nguyên khi rollback code; gỡ nhánh `jobsForChange`, scheduler (`removeJobScheduler`) và processor.

## Security Considerations

- Báo cáo tự động không tự ẩn: tránh bị lợi dụng hạ truyện gốc.
- `detail` chứa id nội bộ, chỉ API mod (phase 15) đọc và dịch; không API công khai nào trả bảng `reports`.
- Processor chỉ đọc nội dung đã đăng, không nhận dữ liệu từ client.

## Next Steps

Phase 15: báo cáo của người dùng, hàng chờ `/moderation` (hiện cả báo cáo `duplicate`), hành động mod; đánh `[x]` checkbox 11 khi xong.

## Ghi chú triển khai (2026-10-05)

- Không bọc transaction: fingerprint commit trước truy vấn ứng viên, nên hai bản copy đăng cùng lúc luôn có một lượt thấy bản kia.
- Báo cáo đặt trên chương **đăng sau** của cặp (bằng nhau thì id lớn hơn); mỗi lượt chèn một báo cáo cho **mỗi** chương copy (khớp tốt nhất chưa bị `dismissed`), nên thứ tự kiểm không làm sót bản copy.
- Chuẩn hoá: bỏ ký tự `\p{Cf}` (zero-width, soft hyphen), NFKC thay NFC (gộp cả fullwidth) — đóng băng cùng hàm hash.
- Ứng viên sắp theo số band key trùng trước `LIMIT 200`.
- Giới hạn đã biết cho docs mod (phase 15): sửa rải đều 1/10 số từ → Jaccard ~0,33, không bắt được.
- Phase 15 cần chốt: trạng thái nào ngoài `dismissed` chặn tạo lại cùng cặp; không thêm trạng thái "chưa xử lý" khác `open` (partial index giả định vậy).

## Câu hỏi mở (đã chốt — Validation Session 1, 2026-10-05)

1. Giữ Jaccard 0,7 năm đầu; xem số báo cáo giả rồi chỉnh.
2. Thêm cột `chapter_fingerprints.content_hash` để backfill phát hiện fingerprint cũ (migration `0002` đã duyệt).

