# Code review: Phase 2, tạo và sửa truyện

Ngày: 2026-10-05 · Phạm vi: `git diff` và các file chưa track (bỏ `.claude/`, lockfile, `routeTree.gen.ts`, các thay đổi chỉ dịch comment)
Plan: `plans/261004-1654-giai-doan-1-doc-va-viet/phase-02-tao-va-sua-truyen.md`

## Gate (reviewer tự chạy)

| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | xanh (7 package) |
| `pnpm lint` | xanh |
| `pnpm test` | 35 file, 204 test pass |
| `pnpm test:int` | 97 pass, 1 skipped (`s3-storage.int.test.ts`, do thiếu `S3_*`) |
| `pnpm test:e2e` | reviewer không chạy |

Checkbox 1 của Giai đoạn 1 trong spec vẫn là `[ ]`, đúng như plan yêu cầu khi int test S3 còn SKIPPED.

## Đối chiếu tiêu chí nghiệm thu

| # | Kết quả | Ghi chú |
|---|---|---|
| 1 | OK | `create-story.ts`: một transaction, `slugify`, `insertStoryWithPublicId` (ON CONFLICT DO NOTHING + retry, có int test), lên role bằng `WHERE role='reader'` |
| 2 | OK | `loadOwnedStory` + `FOR UPDATE`; id sai định dạng → 404; `previousSlug`; tag được thay theo tập; quy về tag chuẩn; tag chính phải là genre; ≤10 |
| 3 | OK | Đủ mọi bước kiểm (bodyLimit 5.5 MiB, `file.size`, magic bytes, MP lấy từ header, `limitInputPixels`, xoay theo EXIF, 2 bản WebP, key hash + immutable, không xoá file cũ, 503, semaphore 2). Có rủi ro bộ nhớ, xem M2 |
| 4 | OK | Int test quét đệ quy key `id/authorId/mainTagId` và chuỗi dạng UUID |
| 5 | OK | `coreError` dùng bảng `as const`. Riêng lỗi JSON hỏng trả code khác chuẩn, xem L1 |
| 6 | OK | `loadOptionalEnv` chạy **trước** `createDb`, nên lỗi production không làm rò pool/Redis. Phần vòng đời được giữ nguyên, chỉ dời file |
| 7 | OK | Chuỗi đi qua Paraglide, có noindex, WriterGate và link ở header. Riêng cache khi đổi tài khoản có lỗi, xem M1 |
| 8 | Một phần | `.output/server/node_modules` có `sharp` và `@img/sharp-darwin-arm64`. Chỉ có binary của máy build, xem M3 |

## Critical

Không có.

## High

Không có.

## Medium

**M1. Đăng xuất rồi đăng nhập tài khoản khác thì vẫn thấy truyện nháp của tài khoản trước**
`apps/web/src/lib/me.ts:39`, `apps/web/src/lib/stories.ts:12-14`, `apps/web/src/routes/sign-in.tsx:34`
- Comment ở `stories.ts:12` nói "Under ['me'] so signing out or in refreshes them together", nhưng code không làm vậy. `useSignOut` chỉ gọi `setQueryData(['me'], null)` với đúng key `['me']`. Hai cache `['me','stories']` và `['me','stories',publicId]` vẫn còn trong suốt `gcTime` (5 phút).
- Khi đăng nhập, code chỉ gọi `invalidateQueries`, tức đánh dấu stale. TanStack Query vẫn trả dữ liệu stale trong lúc refetch.
- Kịch bản (máy dùng chung, toàn bộ là điều hướng SPA): A ở `/write` → đăng xuất → B đăng nhập (`navigate('/')`) → bấm "Viết truyện". B thấy danh sách truyện nháp của A cho tới khi refetch xong. Nếu mở `/write/stories/<id của A>` từ lịch sử, B thấy cả form sửa với tiêu đề và giới thiệu của A, sau đó mới chuyển thành 403.
- Cách sửa: khi đăng xuất gọi `queryClient.removeQueries({ queryKey: meQueryKey })` (khớp theo tiền tố), sau đó mới `setQueryData(meQueryKey, null)`. Khi đăng nhập/đăng ký thì dùng `resetQueries({ queryKey: meQueryKey })` thay cho `invalidateQueries`. Thêm một e2e: A tạo truyện → đăng xuất → B đăng nhập → `/write` không được chứa tiêu đề của A.

**M2. Upload không giới hạn số request chờ: mọi user đã xác thực đều có thể làm phình bộ nhớ**
`packages/api/src/routes/stories.ts:48,60`, `packages/core/src/stories/cover.ts:18,36`, `packages/core/src/lib/semaphore.ts:18`
- `parseBody()` đệm toàn bộ multipart (≤5.5 MiB), sau đó `new Uint8Array(await file.arrayBuffer())` sao chép thêm một lần, rồi request mới vào hàng đợi semaphore. Hàng đợi này không có giới hạn và không có timeout.
- Mỗi request đang chờ giữ khoảng 11 MB. 200 request song song từ một tài khoản sẽ chiếm khoảng 2 GB RSS trên một VPS. Rate limit ở phase 13 mới giải quyết được việc này.
- Đang chạy thì mỗi job còn decode ảnh 2 lần (`source.clone()` hai lần, xem L5), tối đa 24 MP × 4 byte × 2, tức khoảng 190 MB mỗi job, nên khoảng 380 MB khi chạy 2 suất.
- Cách sửa (nhỏ): cho `createSemaphore` thêm `maxWaiting`. Khi hàng đợi đầy thì trả lỗi để route trả 503 `BUSY`/`STORAGE_UNAVAILABLE`, hoặc 429. Có thể đặt `maxWaiting` khoảng 4. Ghi rõ trong plan phase 13 rằng `uploadCover` phải gắn rate limit trước `parseBody`.

**M3. sharp ở bản build chỉ có binary của máy build, và barrel `core` nạp sharp ngay khi import**
`apps/web/vite.config.ts:283-289`, `packages/core/src/index.ts:41-46` và `:55`, `packages/core/src/images/cover.ts:2`
- `nitro traceDeps` chỉ chép package `@img/*` đang được cài. Thư mục `.output` hiện tại chỉ có `sharp-darwin-arm64`. Nếu build trên macOS rồi chép sang VPS Linux, server crash ngay khi import. Nếu image dùng Alpine (musl) thì cũng phải cài đúng libc. Khi viết Dockerfile phải build bên trong image đích, cần ghi điều này vào `docs/` hoặc vào plan deploy.
- `@novel-hub/core/src/index.ts` export lại `processCoverImage` và `stories/cover`. Hai file này `import sharp` ở top-level, nên worker (`apps/worker/src/index.ts:1`), `packages/auth` và script seed đều nạp libvips dù không dùng. Image worker vì vậy cũng bắt buộc phải có binary sharp.
- Cách sửa: tách thành subpath `@novel-hub/core/images` (hoặc `core/covers`) chỉ cho web/API import, hoặc trong `processCoverImage` dùng `await import('sharp')`.

## Low

**L1.** `packages/api/src/lib/validate.ts:14`: khi body JSON hỏng, Hono ném `HTTPException(400)` → `handleError` trả `BAD_REQUEST`, không phải `VALIDATION_ERROR`, và `hc` cũng không suy ra được type cho nhánh này. Có thể chấp nhận. Nếu muốn mã lỗi thống nhất thì map 400 → `VALIDATION_ERROR` trong `handleError`, hoặc ghi nhận đây là ngoại lệ đã biết.

**L2.** `create-story.ts:19-21`, `update-story.ts:26-43`: khi trả `err()` bên trong `db.transaction`, transaction vẫn **commit**. Hiện tại an toàn vì mọi lỗi nghiệp vụ đều xảy ra trước lần ghi đầu tiên. Nhưng phase 5 sẽ thêm ghi outbox vào cùng transaction, nên bất biến này dễ bị phá. Nên ghi rõ trong comment, hoặc thêm helper `rollbackOnErr` (ném một sentinel rồi bắt lại ngoài transaction).

**L3.** `tag-picker.tsx:48-49` + `story-form.tsx:85-92`: lúc chưa chọn tag chính, user vẫn tick được 10 tag phụ. Chọn tag chính sau đó làm tổng thành 11 (bộ đếm hiện "11/10"). Schema client chỉ giới hạn mảng tag phụ ở mức 10, nên form vẫn gửi đi và nhận 422 `TOO_MANY_TAGS`. Nên kiểm tổng số tag ngay ở form, hoặc khoá tick khi `selected.length >= max - 1`.

**L4.** `cover-upload.tsx:23-28`: `URL.createObjectURL` được gọi bên trong `useMemo`, tức là side effect trong lúc render. Ở StrictMode (entry mặc định của Start có bật), hàm memo có thể chạy hai lần và làm rò một URL ở dev. Nên tạo URL trong `onChange` (lưu vào state) và thu hồi trong effect cleanup.

**L5.** `images/cover.ts:49-61`: mỗi lần `clone()` lại decode ảnh gốc. Có thể render bản 600 trước, rồi resize bản 300 từ `w600`. Cách này giảm khoảng một nửa CPU và bộ nhớ, đồng thời giảm áp lực cho M2.

**L6.** `resolve-tags.ts:30-45` chỉ quy đổi tag gộp qua **một** cấp. Nếu công cụ gộp tag sau này tạo chuỗi A→B→C, `tagIds` sẽ chứa B, một tag không chuẩn. Công cụ gộp tag (phase mod) cần giữ bất biến "canonical luôn là gốc", hoặc thêm kiểm tra ở bước này.

**L7.** `routes/write/stories/$publicId/index.tsx:57-58`: `StoryForm` không đặt `key={publicId}`. Nếu sau này có điều hướng SPA thẳng từ truyện A sang truyện B (cùng route, chỉ khác param), form vẫn giữ state của A, và bấm lưu sẽ PATCH dữ liệu của A vào B. Hiện chưa có đường đi nào như vậy, vì luôn phải qua `/write`. Nên thêm `key={story.publicId}` ngay bây giờ cho rẻ.

**L8.** `packages/api/package.json` export `./testing` cho mọi consumer, nên code production cũng import được. Nên chặn bằng ESLint (`no-restricted-imports` cho các file không phải test) hoặc chấp nhận và ghi chú.

**L9 (test).** Test 413 của API dùng `FormData` không có `Content-Length`, nên chỉ đi qua nhánh stream của `bodyLimit`. Nhánh `file.size > maxBytes` (file từ 5 đến 5.5 MiB) chưa có test ở mức API. Ngoài ra, chưa có bằng chứng chạy được nào cho bước plan "Nitro/srvx không chặn body trước 5.5 MB", reviewer cũng không kiểm lại.

## Edge case đã kiểm và thấy ổn

- `.use(sessionMiddleware)` trên sub-app `me`/`stories` chỉ áp dụng cho `/me/*` và `/stories/*`. `/health` và `/tags` không tra phiên, nên `/tags` vẫn cache public được. Int test auth và int test me đều pass.
- CSRF: multipart/PUT từ origin khác bị 403, có test. DELETE/PATCH khác origin bị chặn nhờ preflight và cookie SameSite.
- Lỗi S3 chỉ mang status, không kèm body hay URL đã ký. Lỗi 500 không lộ message.
- Tác giả bị ban: `lookupSession` trả null và `canEditStory` cũng chặn. Không có nhánh nào cho mod/admin sửa truyện của người khác.
- Drizzle bỏ qua key `undefined` trong `.set()`, và `$onUpdate` của `updated_at` khiến `set` không bao giờ rỗng.
- Thứ tự chạy là chủ truyện → semaphore → sharp, nên người không phải chủ truyện không tốn được CPU.
- Ảnh động WebP/PNG chỉ decode khung đầu. GIF, SVG, HEIF đều bị từ chối theo format thật.

## Việc nên làm (theo thứ tự)

1. M1: xoá cache `['me', …]` khi đăng xuất và reset khi đăng nhập, kèm một e2e cho kịch bản đổi tài khoản.
2. M2: giới hạn hàng đợi semaphore và trả 503/429 khi đầy. Kết hợp L5 để giảm số lần decode.
3. M3: tách sharp khỏi barrel `core`. Ghi vào docs deploy rằng phải build trong image Linux đích.
4. L7: thêm `key={story.publicId}`. L3: kiểm tổng số tag ở client.
5. Trước khi đánh `[x]`: điền `S3_*`, chạy `s3-storage.int.test.ts` (không còn skipped), smoke MinIO thủ công (bước 13), chạy `pnpm test:e2e`.

## Điểm: 8/10

Kiến trúc đúng plan; core, policy, Result và route mỏng đều sạch, không có `any`, test có giá trị thật (quét UUID, spy `resize`, rollback tag). Bị trừ điểm vì: lộ cache giữa hai tài khoản trên web, khả năng DoS bộ nhớ khi upload (chưa có rate limit), và sharp bị kéo vào mọi process kèm rủi ro binary khi deploy.

## Câu hỏi còn mở

- Docker image production dùng Debian hay Alpine? Câu trả lời quyết định cách cài `@img/sharp-*` (M3).
- Trước phase 13, có chấp nhận rủi ro M2 hay không, hay giới hạn hàng đợi ngay bây giờ?
