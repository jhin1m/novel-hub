# Fix: publishing-worker.int.test.ts chập chờn

## Nguyên nhân gốc (đã kiểm chứng)
- Test 1 gọi `registerPublishingSchedulers` → `upsertJobScheduler` enqueue ngay lần chạy đầu của 4 job (`repeat:<name>:<ts>`, trạng thái `wait`). `removeJobScheduler` xoá scheduler nhưng **không** xoá các job đã enqueue. Log chẩn đoán in `LEFTOVER` đủ 4 job sau test 1.
- Test 2 khởi worker → worker chạy job sót trước. `nextCompleted` khớp theo **tên** → `drained` resolve khi job `drain-content-events` sót xong; job này chạy trước khi `recordContentChanges` ghi event mới → event mới còn `processedAt = null` → assert dòng 152 đỏ. Log chẩn đoán: `COMPLETED repeat:drain-content-events:…` rồi test đỏ (tái hiện được).
- Không liên quan phase tách file editor; lỗi race có sẵn trong test.

## Sửa (chỉ file test, không đổi code worker/core)
- `apps/worker/src/publishing-worker.int.test.ts`:
  - Test 1: sau khi xoá scheduler gọi `publishingQueue.drain(true)` + assert queue rỗng.
  - Thay `nextCompleted(name)` bằng `runJob(name)`: gắn listener trước, enqueue với `jobId` sinh trước (`crypto.randomUUID()`), chỉ resolve/reject khi đúng job đó completed/failed.

## Kiểm chứng
- Chạy riêng file 12 lần: 12/12 xanh.
- Gate đầy đủ (`typecheck && lint && format:check && test && test:int && test:e2e`): xanh, log `/tmp/nh-gate.log`.

## Quyết định tự động
- [auto] Không đổi `registerPublishingSchedulers`: hành vi enqueue ngay khi upsert là đúng ý ở production (job chạy liền khi worker khởi động); chỉ test cần dọn.

## Câu hỏi mở
- Không.
