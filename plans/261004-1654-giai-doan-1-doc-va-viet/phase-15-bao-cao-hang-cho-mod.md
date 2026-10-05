---
phase: 15
title: "Phase 15: Báo cáo vi phạm và hàng chờ mod"
status: pending
priority: P1
effort: "2d"
dependencies: [14]
---

# Phase 15: Báo cáo vi phạm và hàng chờ mod

Spec checkbox: `Kiểm tra trùng lặp khi đăng chương, báo cáo vi phạm, trang hàng chờ cho mod (mục 7).` — phase này làm **phần 2/2** (báo cáo, hàng chờ, hành động mod) và **đánh `[x]`** checkbox khi xong. Phần trùng lặp đã ở phase 14. <!-- Red Team: tách phase -->

## Context Links

- Spec mục 7 (phân quyền, báo cáo và hàng chờ, "hành động một cú bấm: ẩn, khôi phục, mute, ban, gộp tag", mọi hành động ghi `moderation_actions`; `banned` không đăng nhập được, nội dung bị ẩn), mục 4 (`reports`, `moderation_actions`, `tags.canonical_id`)
- [plan.md](./plan.md) — "Ban" (một cơ chế), "Outbox và hàng đợi", "Purge CDN"
- Code (đã kiểm 2026-10-05):
  - `packages/db/src/schema/moderation.ts:8-27` (`reports`), `:30-47` (`moderation_actions`: `mod_id` NOT NULL, `target_type`, `target_id`, `action`, `note`)
  - `packages/db/src/schema/stories.ts:19-35` (`tags.canonical_id`, check `tags_canonical_not_self`)
  - `packages/core/src/policies/user.ts:22-31` (bất biến: ban ⇒ xoá mọi session trong một transaction)
  - `packages/auth/src/hooks.ts:111-120` (`createSessionCreateBefore` chặn tạo session khi bị ban), `:130-135` (`bannedGuard`)
  - `packages/api/src/middleware/require-auth.ts:31` (`requireAuth`), `:33-37` (`requireRole`)
  - `packages/db/src/schema/auth.ts:38` (`sessions`)
- Phase 5: `recordContentChanges(tx, changes)`, `ContentChange` (gồm `{ entity: 'user'; action: 'updated' | 'banned' | 'unbanned'; userId }`), `recomputeStoryCounters(tx, storyId)`, chặn đăng lại nội dung `hidden_by_mod`, thứ tự khoá story → chapter → draft, sweeper bỏ qua tác giả bị ban. Phase 7: `canReadChapter` (lọc tác giả `banned`). Phase 9: purge theo event story/chapter/user. Phase 10: `publicStoryWhere`, trang truyện/tác giả. Phase 11: search-sync theo event. Phase 13: `rateLimit(port, 'report')`. Phase 14: báo cáo `duplicate`, `duplicateReportDetail`.

## Overview

- Core `reports` (người dùng báo cáo truyện/chương/tài khoản) và `moderation` (ẩn/khôi phục, mute, ban, gộp tag, xử lý báo cáo).
- **Mọi hành động mod**: đổi trạng thái + ghi `moderation_actions` + `recordContentChanges` (khi ảnh hưởng nội dung công khai) trong **cùng một transaction**. <!-- Red Team: outbox -->
- **Ban một cơ chế:** đổi `status` + xoá session + outbox `{ entity: 'user', action: 'banned' }`; lọc hiển thị nằm sẵn ở `canReadChapter`/`publicStoryWhere`. Không ẩn truyện hàng loạt, không note `ban:`. Bỏ ban tương tự. <!-- Red Team: ban mechanism -->
- Hono `reports`, `moderation`; web: nút báo cáo ở trang truyện/chương/tác giả, trang `/kiem-duyet`.

## Key Insights

- Ban không chạm `stories`: phase 7/10/11/16 đã lọc `users.status <> 'banned'`, nên đổi status là đủ để mọi truy vấn công khai ẩn nội dung. Việc còn lại là làm sạch bản sao ngoài DB: outbox → phase 9 purge trang tác giả + mọi truyện/chương của tác giả (kể cả chương từng đăng), phase 11 đồng bộ/xoá doc tìm kiếm. Bỏ ban phát `unbanned` → cùng hai job đưa nội dung trở lại.
- Thứ tự khoá như phase 5 (**story → chapter → draft**): hành động trên chương khoá story trước (`SELECT … FROM stories … FOR UPDATE`), rồi chapter; hành động mod hiện không chạm `chapter_drafts`, nếu sau này cần thì khoá draft sau chapter. Hành động trên user khoá dòng `users`; gộp tag khoá hai tag theo thứ tự `id`. Tránh deadlock với đăng chương/sweeper. <!-- Red Team: lock order -->
- Ẩn/khôi phục chương làm đổi bộ đếm truyện → gọi `recomputeStoryCounters(tx, storyId)` trong cùng transaction.
- Bỏ ban: chương hẹn giờ đã quá hạn của tác giả sẽ được sweeper đăng ngay ở lượt quét kế tiếp (sweeper chỉ bỏ qua khi đang `banned`). Đã chốt ở validate: chấp nhận; ghi vào `docs/moderation-guide.md`.
- Trang truyện/chương/tác giả là HTML cache công khai → nút "Báo cáo" và link "Kiểm duyệt" trong header phải SSR giống nhau cho mọi người; hành vi (mở dialog, hiện link cho mod) chỉ ở client sau `useMe`.
- Không lộ UUID: API công khai nhận `storyPublicId`, `number`, `username`. API mod dùng `id` báo cáo làm khoá mờ (không hiển thị trên giao diện); `detail` của báo cáo `duplicate` được dịch sang `publicId`/`number` trước khi trả.
- Bình luận chưa có ở Giai đoạn 1 → target `comment` chưa mở (YAGNI).

## Requirements

**Functional**

- `POST /api/v1/reports` (đăng nhập, `rateLimit('report')`), body `{ target: { type: 'story', storyPublicId } | { type: 'chapter', storyPublicId, number } | { type: 'user', username }, reason, detail? }`; `reason ∈ copyright | plagiarism | spam | prohibited | mislabeled`; `detail ≤ 1000`.
  - Target phải nhìn thấy được: truyện qua `publicStoryWhere({ includeMature: true })`, chương qua `canReadChapter(null, …)`, user tồn tại và không `banned`. Không thấy → 404.
  - Cùng người, cùng target, còn báo cáo `open` → 200 `{ created: false }`; tạo mới → 201 `{ created: true }`. Kiểm và chèn dưới `pg_advisory_xact_lock` theo (reporter, target).
- `GET /api/v1/moderation/reports?status&reason&page` (mod/admin): mỗi mục kèm ngữ cảnh đã dịch — truyện (publicId, slug, title, visibility, tác giả), chương (number, title, status), user (username, displayName, status), báo cáo `duplicate` kèm chương khớp và % giống; người báo (username hoặc "Hệ thống"); số báo cáo `open` cùng target.
- `POST /api/v1/moderation/actions`, body union theo `action`:
  - `hide_story` / `restore_story` (storyPublicId); `hide_chapter` / `restore_chapter` (storyPublicId, number);
  - `mute_user` / `unmute_user` / `ban_user` / `unban_user` (username);
  - `merge_tag` (sourceSlug, targetSlug); `dismiss_report` / `resolve_report` (reportId);
  - tuỳ chọn `note` (≤ 500) và `reportId`: hành động trên target thì mọi báo cáo `open` của target chuyển `resolved`, `handled_by` = mod.
- Chuyển trạng thái hợp lệ (sai → 409 `INVALID_STATE`):

| Hành động | Từ → tới | Outbox |
|---|---|---|
| `hide_story` / `restore_story` | `visibility` `published` ↔ `hidden_by_mod` | story `hidden` / `restored` |
| `hide_chapter` / `restore_chapter` | `status` `published` ↔ `hidden_by_mod` (chương chưa xoá mềm) + tính lại bộ đếm | chapter `hidden` / `restored` |
| `mute_user` / `unmute_user` | `active` ↔ `muted` | — (chỉ chặn bình luận, Giai đoạn 2) |
| `ban_user` | `active`/`muted` → `banned` + `DELETE FROM sessions WHERE user_id` | user `banned` |
| `unban_user` | `banned` → `active` | user `unbanned` |
| `merge_tag` | nguồn `canonical_id = đích` | story `updated` cho mỗi truyện bị ảnh hưởng |
| `dismiss_report` / `resolve_report` | báo cáo `open` → `dismissed`/`resolved` | — |

- Quyền: mod không tác động lên mod/admin; không ai tự xử mình; admin **không** tác động lên admin khác (đã chốt ở validate).
- Gộp tag: cùng `kind`, nguồn ≠ đích, đích `canonical_id IS NULL`; chuyển `story_tags` (bỏ trùng) và `stories.main_tag_id` sang đích; tag đã gộp vào nguồn trỏ sang đích; nguồn `canonical_id = đích`.
- Mọi hành động ghi `moderation_actions` (`target_type ∈ story|chapter|user|tag|report`, `action` = tên hành động, `note` là ghi chú tự do của mod).
- Web:
  - `ReportButton` ở trang truyện, cuối trang chương, trang tác giả; khách bấm → `/dang-nhap?redirect=…`; dialog chọn lý do + mô tả (đếm ký tự), gửi xong "Đã gửi báo cáo".
  - `/kiem-duyet` (`ssr: false`, `validateSearch` status + reason + page): danh sách kèm ngữ cảnh, nút hành động, xác nhận trước khi ban/gộp tag; tab "Gộp tag". Không phải mod/admin → API 403, UI báo không có quyền. `noindex`.
  - Header: link "Kiểm duyệt" chỉ hiện ở client cho mod/admin.

**Non-functional**

- Không truy vấn DB từ route; quyền qua `core/policies`, middleware chỉ dịch kết quả. Mọi chuỗi UI qua Paraglide.
- Mỗi hành động một transaction ngắn; không gọi mạng ngoài trong transaction.

## Architecture

```
POST /api/v1/reports ─ session → requireAuth → rateLimit('report') → core.createReport
/api/v1/moderation/* ─ session → requireRole('mod','admin') → core (canModerate / canModerateUser)
applyModerationAction(db, actor, input):
  tx: khoá theo thứ tự (story → chapter [→ draft nếu chạm] | users | tags theo id)
      kiểm trạng thái nguồn → UPDATE → (ban_user: DELETE sessions) → (chương: recomputeStoryCounters)
      INSERT moderation_actions → resolve reports (nếu reportId) → recordContentChanges(tx, changes)
  COMMIT ─▶ worker drain outbox → jobsForChange → purge (phase 9) + search-sync (phase 11)
```

```ts
// packages/shared/src/schemas/reports.ts
export const USER_REPORT_REASONS = ['copyright', 'plagiarism', 'spam', 'prohibited', 'mislabeled'] as const;
export const REPORT_REASONS = [...USER_REPORT_REASONS, 'duplicate'] as const;
export const REPORT_STATUSES = ['open', 'resolved', 'dismissed'] as const;
export const MODERATION_ACTIONS = ['hide_story', 'restore_story', 'hide_chapter', 'restore_chapter', 'mute_user',
  'unmute_user', 'ban_user', 'unban_user', 'merge_tag', 'dismiss_report', 'resolve_report'] as const;
export const reportCreateSchema;      // union target
export const moderationActionSchema;  // discriminatedUnion('action', …)
export const reportListQuerySchema;   // status, reason, page (.catch)
// LIMITS (phase 2) thêm: reportDetailMax: 1000, modNoteMax: 500

// packages/core/src/policies/moderation.ts
export function canModerate(user: PolicyUser): boolean;   // mod|admin và active
export function canModerateUser(actor: PolicyUser & { id: string }, target: { id: string; role: UserRole }): boolean;
// packages/core/src/reports/*
export function createReport(db: Db, reporter: CurrentUser, input: ReportCreate):
  Promise<Result<{ created: boolean }, 'NOT_FOUND'>>;
export function listReports(db: Db, actor: CurrentUser, query: ReportListQuery):
  Promise<Result<ReportListPage, 'FORBIDDEN'>>;
// packages/core/src/moderation/*
export type ModerationError = 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_STATE';
export function applyModerationAction(db: Db, actor: CurrentUser, input: ModerationActionInput):
  Promise<Result<{ action: ModerationAction }, ModerationError>>;
export function banUser(tx: Tx, actor: CurrentUser, targetUserId: string, note?: string): Promise<void>; // status + sessions + log + outbox
export function unbanUser(tx: Tx, actor: CurrentUser, targetUserId: string, note?: string): Promise<void>;
```

## File Inventory

| File | Action | Ghi chú |
|---|---|---|
| `packages/shared/src/schemas/reports.ts` (+ test), `src/limits.ts` | create / modify | |
| `packages/core/src/policies/moderation.ts` (+ test) | create | |
| `packages/core/src/reports/{create-report,list-reports,report-context}.ts` (+ `reports.int.test.ts`) | create | |
| `packages/core/src/moderation/{apply-action,content-visibility,user-status,merge-tag,resolve-reports}.ts` (+ `moderation.int.test.ts`) | create | `user-status.ts` chứa `banUser`/`unbanUser`/mute |
| `packages/core/src/policies/user.ts` | modify | comment bất biến trỏ tới `banUser` thực tế (không đổi logic) |
| `packages/core/src/index.ts` | modify | export |
| `packages/api/src/routes/{reports,moderation}.ts` (+ `.test.ts`), `app.ts` | create / modify | sub-app chain, `validate()`, `coreError()` |
| `apps/web/src/components/report/{report-button,report-dialog}.tsx` | create | `useMutation` + `hc` |
| trang truyện, chương, tác giả (phase 7/10) | modify | gắn `ReportButton` |
| header site (phase 1) | modify | link "Kiểm duyệt" client-only |
| `apps/web/src/routes/kiem-duyet.tsx` + `components/moderation/*` | create | |
| `packages/shared/messages/vi.json` | modify | nhãn lý do, trạng thái, hành động, xác nhận |
| `apps/web/e2e/moderation.spec.ts` (+ helper seed) | create | |
| `docs/moderation-guide.md` | create | hướng dẫn mod ngắn: ý nghĩa hành động, giới hạn dò trùng (copy < ~50% không bắt được), bỏ ban kéo theo chương hẹn giờ quá hạn |
| `apps/web/src/routeTree.gen.ts` | regenerate | |

Không migration, không env mới, không dependency mới.

## Implementation Steps

1. **Shared:** schema báo cáo/hành động/truy vấn, `LIMITS` mới; unit test union (thiếu field, action lạ → lỗi).
2. **Policies:** `canModerate`, `canModerateUser` + unit test đủ bảng role × status × tự xử mình.
3. **`createReport`:** tra target theo khoá công khai (Requirements), advisory lock, kiểm `open` trùng, insert. **`listReports`:** join + dịch ngữ cảnh; `duplicate` parse `detail` bằng `duplicateReportDetail` (phase 14), tra chương khớp → `{ storyPublicId, slug, number, title }`; `detail` hỏng → bỏ phần khớp, không throw.
4. **Moderation core:** mỗi hành động một hàm nhỏ, `applyModerationAction` mở transaction, kiểm `canModerate`, khoá theo thứ tự ở Key Insights, kiểm trạng thái nguồn, update, ghi `moderation_actions`, resolve báo cáo nếu có `reportId`, `recordContentChanges(tx, …)` theo bảng. `ban_user`: `UPDATE users SET status = 'banned', updated_at = now()` (SQL thô phải tự đặt `updated_at`), `DELETE FROM sessions WHERE user_id = $1`, log, outbox — không đụng `stories`. `unban_user`: status `active`, log, outbox. `merge_tag` trả danh sách truyện bị ảnh hưởng để sinh event.
5. **Hono:** `reports` (`POST /`), `moderation` (`GET /reports`, `POST /actions`), chain, `validate()`, `coreError()` (`NOT_FOUND` 404, `INVALID_STATE` 409, `FORBIDDEN` 403); không trả UUID ngoài `reportId`. Test dựng app qua `makeTestApiDeps`.
6. **Web:** `ReportButton` + `ReportDialog`; `/kiem-duyet` dùng TanStack Query + `useMutation` rồi invalidate; dialog xác nhận cho ban/gộp tag; head `noindex`; link header client-only.
7. **E2E `moderation.spec.ts`:** helper seed (gọi core/DB trực tiếp) truyện có chương đã đăng của tác giả A, user B, mod M → B báo cáo chương → M mở `/kiem-duyet`, thấy báo cáo, bấm "Ẩn chương" → trang chương trả 404 (e2e chạy `vite dev`, không CDN), báo cáo `resolved`, có dòng `content_events` chưa xử lý cho chương (e2e không chạy worker).
8. **`docs/moderation-guide.md`** ngắn gọn, tiếng Việt.
9. Smoke thủ công với worker chạy: ban tác giả có truyện đã đăng → trang truyện/chương/tác giả 404, kết quả tìm kiếm không còn truyện; bỏ ban → trở lại.
10. Gate: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e`. Đánh `[x]` checkbox "Kiểm tra trùng lặp khi đăng chương, báo cáo vi phạm, trang hàng chờ cho mod" trong spec (phase 14 đã xong).

## Function / Interface Checklist

- [ ] `reportCreateSchema`, `moderationActionSchema`, `reportListQuerySchema`, `MODERATION_ACTIONS`
- [ ] `canModerate`, `canModerateUser`
- [ ] `createReport`, `listReports`
- [ ] `applyModerationAction`, `banUser`, `unbanUser`, mute/unmute, hide/restore story/chapter, `mergeTag`, resolve/dismiss
- [ ] Route `POST /api/v1/reports`, `GET /api/v1/moderation/reports`, `POST /api/v1/moderation/actions`
- [ ] `ReportButton`, `ReportDialog`, route `/kiem-duyet`

## Test Scenario Matrix

| Mức | Kịch bản | Loại |
|---|---|---|
| Critical | Ban: status `banned`, session bị xoá, `moderation_actions` có dòng, `content_events` có `{ entity:'user', action:'banned' }`, `stories` không đổi; lỗi giữa chừng → rollback toàn bộ | int |
| Critical | Sau ban: `canReadChapter` của chương tác giả → không đọc được; `publicStoryWhere` loại truyện; bỏ ban → đọc lại được, outbox có `unbanned` | int |
| Critical | `jobsForChange` cho user `banned`/`unbanned` sinh job purge và search-sync (khớp phase 9/11) | unit |
| Critical | Mọi hành động mod ghi `moderation_actions` và (nếu đổi nội dung công khai) `content_events` trong cùng transaction — rollback thì không còn dòng nào | int |
| Critical | Mod ban mod/admin → `FORBIDDEN`; tự ban mình → `FORBIDDEN`; reader gọi `/moderation/*` → 403 | unit (policy) + unit route |
| Critical | Mod ẩn chương song song với tác giả đăng chương khác cùng truyện → không deadlock, cả hai hoàn tất hoặc một bên chờ | int (`Promise.all`) |
| Critical | Tác giả đăng lại chương `hidden_by_mod` / đăng chương vào truyện `hidden_by_mod` → bị từ chối, vẫn bị ẩn | int (core publishing) |
| High | Sai trạng thái nguồn (ẩn chương draft, bỏ ban user active) → `INVALID_STATE` | int |
| High | Ẩn chương → bộ đếm truyện giảm, outbox chapter `hidden`; khôi phục → tăng lại | int |
| High | Gộp tag: khác kind → lỗi; đích đã bị gộp → lỗi; `story_tags` trùng không lỗi; `main_tag_id` chuyển sang đích; outbox có story `updated` cho mỗi truyện bị ảnh hưởng | int |
| High | Báo cáo trùng (cùng người, target, còn open) → 200 `created: false`; target không thấy → 404; vượt rate limit → 429 | int + unit route |
| High | `listReports` dịch báo cáo `duplicate` sang publicId/number; JSON không chứa UUID nào ngoài `reportId` (regex) | unit route + int |
| Critical | Báo cáo → mod ẩn chương → chương 404, báo cáo `resolved` | e2e |
| Medium | Worker thật: ban → trang và tìm kiếm không còn nội dung; bỏ ban → trở lại | thủ công (bước 9) |

## Dependency Map

- Cần: phase 5 (outbox, `recomputeStoryCounters`, khoá story → chapter, chặn nội dung `hidden_by_mod`, sweeper bỏ tác giả bị ban), phase 7 (`canReadChapter`, trang chương), phase 9 (purge theo event user/story/chapter), phase 10 (`publicStoryWhere`, trang truyện/tác giả), phase 11 (search-sync theo event user), phase 13 (`rateLimit`), phase 14 (báo cáo `duplicate`).
- Phase 16: `noindex` cho `/kiem-duyet` (kiểm lại), sitemap dùng `publicStoryWhere` nên tự loại tác giả bị ban và nội dung bị ẩn.
- Giai đoạn 2: target `comment`, áp `muted` cho bình luận.

## Success Criteria

- [ ] Người dùng báo cáo truyện/chương/tài khoản với 5 lý do; có rate limit
- [ ] `/kiem-duyet` lọc theo trạng thái và lý do, hiện cả báo cáo `duplicate`; hành động một cú bấm: ẩn, khôi phục, mute, ban, gộp tag
- [ ] Mọi hành động có `moderation_actions` + outbox trong cùng transaction; ban xoá session cùng transaction, không ẩn truyện hàng loạt
- [ ] Ban/bỏ ban làm nội dung biến mất/trở lại ở trang, tìm kiếm (qua outbox)
- [ ] Gate xanh; checkbox 11 `[x]`

## Risk Assessment

| Rủi ro | Khả năng × Tác động | Giảm thiểu |
|---|---|---|
| Phase 9/11 chưa xử lý event `user` → ban để lại cache/tìm kiếm cũ | Thấp × Cao | Test Critical `jobsForChange` cho user; smoke thủ công bước 9 |
| Deadlock giữa mod action và đăng chương | Thấp × TB | Thứ tự khoá story → chapter; int test song song |
| Gộp tag phổ biến sinh nhiều event purge | Thấp × TB | Outbox xử lý dần; năm đầu ít truyện; ghi rủi ro vào hướng dẫn mod |
| Mod bấm nhầm ban | TB × TB | Dialog xác nhận; bỏ ban đảo được hoàn toàn (không đổi `stories`) |
| Bỏ ban làm chương hẹn giờ quá hạn đăng dồn | Thấp × Thấp | Ghi trong `docs/moderation-guide.md` |

Rollback: không migration; gỡ sub-app `reports`/`moderation`, route `/kiem-duyet`, nút báo cáo. Trạng thái do mod đổi có nhật ký để đảo tay.

## Security Considerations

- Kiểm quyền hai lớp: `requireRole('mod','admin')` ở route và `canModerate`/`canModerateUser` trong core.
- Ban tuân bất biến `policies/user.ts`: xoá session cùng transaction; `createSessionCreateBefore` và `bannedGuard` là lớp chặn thêm.
- `detail`, `note` là plain text, render bằng text node (React escape).
- Không lộ danh tính người báo cho tác giả; API công khai không trả gì về báo cáo.
- Báo cáo (kể cả tự động) không tự ẩn nội dung.

## Next Steps

Phase 16 (SEO). Giai đoạn 2 thêm target `comment` và áp `muted` cho bình luận.

## Câu hỏi mở (đã chốt — Validation Session 1, 2026-10-05)

1. Báo cáo chỉ cần đăng nhập + rate limit (không đòi email đã xác thực).
2. Mod và admin đều gộp được tag.
3. Admin không ban được admin (chỉ tác động lên reader/author/mod).
4. Bỏ ban: chương `scheduled` quá giờ được sweeper đăng ở lần quét kế (≤ 60 giây), có thể đăng dồn; ghi vào `docs/moderation-guide.md`.

