---
phase: 9
title: "Cuộc thi theo chủ đề"
status: completed
priority: P2
effort: "2d"
dependencies: [8]
---

# Phase 9: Cuộc thi theo chủ đề

<!-- Red Team: purge trang cuộc thi, bỏ chip dự thi, từ vựng log + target contest, mod không xếp hạng truyện của mình, test đếm bảng -->

## Context Links

- Spec: §5 Gđ2 checkbox 6 (phần "công cụ tổ chức cuộc thi theo chủ đề"), §7 (18+ không vào danh sách công khai SSR; mọi hành động mod ghi log), §10 (không thanh toán, không giải thưởng tiền)
- Phase 8: mẫu tab `/moderation` mới, log `moderation_actions`
- Scout: backend §1 (chưa có bảng cuộc thi), §9; frontend §1 (route công khai + cache), §3 (`/write/stories/$publicId`)
- Research: `research/researcher-03-badges-featured-contests.md` §3 (không theo phương án "suy ra từ tag")

## Overview

Mod tạo cuộc thi theo chủ đề (tên, mô tả chủ đề + luật, thời gian mở). Tác giả đưa truyện mới viết trong thời gian cuộc thi vào dự thi (hoặc rút) từ trang quản lý truyện. Trang công khai `/contests` và `/contests/{slug}` liệt kê cuộc thi và bài dự thi; sau khi kết thúc mod gán hạng 1–3, trang cuộc thi hiện người thắng. Xong phase đánh `[x]` checkbox 6.

## Key Insights

- Chưa có bảng → migration mới `contests`, `contest_entries`. Bảng/cột snake_case, PK UUIDv7 (`uuidPk()`), `timestamptz`; tập trạng thái mở dùng text + Zod (quy tắc `schema/enums.ts:3-4`) — ở đây **không lưu trạng thái**, suy ra từ thời gian.
- Slug sinh từ tiêu đề bằng `slugify` (`packages/shared/src/slug.ts`), cuộc thi cần slug **duy nhất** (khác truyện) → gặp trùng thêm hậu tố `-2`, `-3`; slug không đổi khi sửa tên (URL ổn định). [auto]
- Trang công khai SSR cache danh sách 10 phút như trang tag; 18+ không được dự thi nên HTML không bao giờ có 18+. [auto]
- `catalogUrls` (`packages/core/src/catalog/urls.ts:15`) phải thêm `/contests` + trang các cuộc thi mà truyện đang dự thi, để truyện bị ẩn/tác giả bị ban biến khỏi trang cuộc thi khi purge (`LIST_CACHE` có SWR 1 giờ). <!-- Red Team: purge contests -->
- `MODERATION_LOG_ACTIONS` (phase 1) thêm `create_contest`, `update_contest`, `set_contest_placement`; `ModerationTarget.type` thêm `contest` (`packages/core/src/moderation/log-action.ts`).
- `packages/db/src/schema.int.test.ts:75-80` đếm cố định số bảng → 26 → 28.
- `canonicalPath` thêm `contests` và `contest`; sitemap pages thêm các trang cuộc thi.
- Trang quản lý truyện của tác giả: `apps/web/src/routes/write/stories/$publicId/index.tsx`.

## Requirements

**Functional**
- Dữ liệu cuộc thi: `title` (2–150), `slug` (unique, tự sinh), `description` (văn bản thuần ≤ 5.000, giữ xuống dòng: chủ đề, luật), `starts_at`, `ends_at` (> starts, ≤ 180 ngày), `created_by`, `created_at`, `updated_at`.
- Trạng thái suy ra: `upcoming` (now < starts), `open` (starts ≤ now < ends), `ended` (now ≥ ends).
- Bài dự thi `contest_entries(contest_id, story_id, created_at, placement smallint null CHECK 1..3)`, PK (contest_id, story_id), unique (contest_id, placement) where placement is not null.
- Tác giả tham gia: cuộc thi `open`; truyện của mình (`canEditStory`, không thì `NOT_FOUND`), `visibility = 'published'`, **không 18+**, `stories.created_at ≥ contest.starts_at`. Lỗi: `CONTEST_NOT_OPEN` (409), `CONTEST_STORY_INELIGIBLE` (422, kèm lý do: `mature`/`too_old`/`not_published`).
- Tác giả rút: khi cuộc thi còn `open`.
- Mod (`/moderation?tab=contests`): tạo, sửa (tên, mô tả, thời gian; không sửa `starts_at` khi đã có bài dự thi), xem danh sách bài, gán/bỏ hạng 1–3 khi `ended`; **không gán hạng cho truyện của chính mình** (`FORBIDDEN`). Mọi thao tác ghi `moderation_actions` (target `{type:'contest', id}`, action `create_contest`/`update_contest`/`set_contest_placement`). <!-- Red Team: mod self-guard -->
- `/contests`: ba nhóm (Đang diễn ra, Sắp diễn ra, Đã kết thúc — 20 gần nhất), mỗi mục: tên, thời gian, số bài dự thi.
- `/contests/{slug}`: tên, thời gian + trạng thái, mô tả (đoạn văn, font content), khu "Kết quả" (khi `ended` và có hạng: hạng 1–3 dạng thẻ truyện), khu "Bài dự thi" (`StoryGrid`, mới tham gia trước, phân trang `?page=` 24/trang). Bài của tác giả bị ban / truyện bị ẩn không hiện.
- Liên kết: footer thêm "Cuộc thi"; trang quản lý truyện có khối "Cuộc thi" (danh sách cuộc thi đang mở, nút Tham gia/Rút cho truyện này, trạng thái hợp lệ).
- Không có chip "Dự thi" trên trang truyện (trang truyện cache 1 ngày, tham gia/rút không purge → chip sai tới 24 giờ). <!-- Red Team: cut chip -->

**Non-functional**
- Cache: `/contests`, `/contests/{slug}` dùng `publicPageHeaders(status,{list:true})` (10 phút); purge qua `catalogUrls` khi truyện dự thi/tác giả đổi trạng thái. Tham gia/rút/gán hạng không purge (hiện sau TTL).
- URL chuẩn: `/contests/{slug}?page=N` (N > 1), query khác → 301 như trang tag.

## Architecture

```
DB: contests(id, slug unique, title, description, starts_at, ends_at, created_by → users, created_at, updated_at, CHECK ends_at > starts_at)
    contest_entries(contest_id → contests cascade, story_id → stories cascade, created_at, placement, PK, unique placement partial)
core/contests:
  manage-contests.ts  createContest, updateContest, setPlacement (mod, log)
  contest-entries.ts  enterContest, withdrawEntry, listOpenContestsForStory (tác giả)
  read-contests.ts    listContestsPage, getContestPage (công khai, publicStoryWhere includeMature:false)
  contest-status.ts   contestStatus(contest, now) (thuần)
API: PUT|DELETE /contests/:slug/entries/:publicId (requireVerifiedEmail), GET /contests/open?story=publicId (tác giả)
     GET|POST /moderation/contests, PATCH /moderation/contests/:id, GET /moderation/contests/:id/entries, PUT /moderation/contests/:id/placements
Web: routes/contests.index.tsx, routes/contests.$slug.tsx (server-fn), moderation tab, khối trong /write/stories/$publicId
```

## Related Code Files

| Hành động | File |
|---|---|
| Create | `packages/db/src/schema/contests.ts` (+ export trong schema index) + migration mới |
| Create | `packages/shared/src/schemas/contest.ts` (+ test): create/update/placement/entry schema, `ContestStatus`, DTO; Modify `limits.ts` (`contestTitle`, `contestDescriptionMax`, `contestMaxDays`), `canonical-path.ts` (+ test) kinds `contests`, `contest` {slug, page?} |
| Create | `packages/core/src/contests/contest-status.ts` (+ test), `manage-contests.ts`, `contest-entries.ts`, `read-contests.ts`, `contest-slug.ts`, `contests.int.test.ts` |
| Modify | `packages/core/src/catalog/urls.ts` (+ int test: `/contests` + trang cuộc thi đang dự), `seo/sitemap.ts` (+ int test), `moderation/log-action.ts` (`ModerationTarget` + `contest`), `core/src/index.ts` |
| Modify | `packages/shared/src/schemas/reports.ts` (+ `reports.test.ts`): `MODERATION_LOG_ACTIONS` thêm 3 action cuộc thi |
| Modify | `packages/db/src/schema.int.test.ts` (26 → 28 bảng) |
| Create | `packages/api/src/routes/contests.ts` (+ int test); Modify `routes/moderation.ts` (+ int test), `app.ts`, `lib/core-errors.ts` (`CONTEST_NOT_OPEN` 409, `CONTEST_STORY_INELIGIBLE` 422, `CONTEST_PLACEMENT_TAKEN` 409; không tìm thấy dùng `NOT_FOUND`, chưa kết thúc / đã có bài dùng `INVALID_STATE`) |
| Create | `apps/web/src/server-fns/contests.ts`, `routes/contests.index.tsx`, `routes/contests.$slug.tsx` |
| Create | `apps/web/src/components/contests/contest-list.tsx`, `contest-header.tsx`, `contest-results.tsx`, `contest-entry-panel.tsx` (khối trong trang quản lý truyện) (+ test render) |
| Create | `apps/web/src/components/moderation/contest-form.tsx`, `contest-admin-list.tsx`, `contest-placements.tsx`; Modify `moderation-tab-links.tsx`, `routes/moderation.tsx`, `lib/moderation.ts` |
| Create | `apps/web/src/lib/contests.ts` (hook tác giả) |
| Modify | `apps/web/src/components/site-footer.tsx` (link), `routes/write/stories/$publicId/index.tsx` |
| Modify | `packages/shared/messages/vi.json` (`contest_*`, `moderation_tab_contests`) |
| Create | `apps/web/e2e/contests.spec.ts` |
| Modify | `docs/code-standards.md` (URL), `docs/moderation-guide.md`, `docs/project-spec.md` (`[x]` checkbox 6) |

## Function / Interface Checklist

- [x] `contestStatus({startsAt, endsAt}, now) → 'upcoming'|'open'|'ended'`
- [x] `createContest(tx, actor, input)`, `updateContest(tx, actor, id, patch)`, `setPlacement(tx, actor, contestId, storyPublicId, placement|null)`
- [x] `enterContest(db, actor, slug, publicId)`, `withdrawEntry(db, actor, slug, publicId)`
- [x] `listOpenContestsForStory(db, actor, publicId) → Array<{slug, title, endsAt, entered, eligible, reason?}>`
- [x] `listContestsPage(db, now)`, `getContestPage(db, slug, page, now)`
- [x] `uniqueContestSlug(tx, title)`
- [x] `canonicalPath({kind:'contests'})`, `canonicalPath({kind:'contest', slug, page?})`

## Implementation Steps

1. DB schema + migration (`pnpm db:generate` → kiểm SQL → `pnpm db:migrate`).
2. Shared: schema, limits, canonical; unit test.
3. Core: status thuần → slug → manage (mod, log) → entries (tác giả) → read (công khai). Int test: tham gia hợp lệ; truyện tạo trước `starts_at` → ineligible `too_old`; 18+ → `mature`; cuộc thi chưa mở/đã kết thúc → `CONTEST_NOT_OPEN`; rút khi mở; gán hạng trước khi kết thúc → `INVALID_STATE`; trùng hạng → `CONTEST_PLACEMENT_TAKEN`; mod gán hạng truyện của mình → `FORBIDDEN`; sửa `starts_at` khi có bài → `INVALID_STATE`; `catalogUrls` của truyện đang dự thi có trang cuộc thi; trang công khai bỏ bài của tác giả bị ban.
4. API: route tác giả + route mod; int test quyền (reader không gọi được route mod; tác giả khác không đưa truyện người khác).
5. Web công khai: hai route (loader → server-fn, `notFound()` khi slug không có, 301 URL chuẩn), component; footer link; sitemap.
6. Web tác giả: `ContestEntryPanel` trong trang quản lý truyện (chỉ hiện khi có cuộc thi đang mở).
7. Web mod: tab "Cuộc thi" (danh sách, form tạo/sửa với `datetime-local` giờ VN dùng `apps/web/src/lib/vn-datetime.ts` của phase 8, màn bài dự thi + chọn hạng).
8. i18n, docs, e2e: mod tạo cuộc thi đang mở → tác giả tạo truyện mới, đăng chương, vào trang quản lý tham gia → `/contests/{slug}` thấy bài → (helper SQL dời `ends_at` về quá khứ) mod gán hạng 1 → trang cuộc thi hiện "Kết quả" với truyện đó; `/contests` liệt kê đúng nhóm.
9. Gate xanh → `[x]` checkbox 6. Cập nhật Status plan.

## Test Scenario Matrix

| Mức | Kịch bản |
|---|---|
| Unit | `contestStatus` 3 trạng thái + biên; schema (ends ≤ starts, > 180 ngày, placement 0/4); canonical |
| Int (core) | bước 3; slug trùng → `-2` |
| Int (api) | bước 4 |
| Unit (web) | `ContestResults` chỉ render khi có hạng; `ContestList` ba nhóm |
| E2E | bước 8; header `Cache-Control: public` ở `/contests/{slug}` |

## Dependency Map

- Cần: phase 8 (mẫu tab mod, chuyển giờ VN), `canEditStory`, `publicStoryWhere`, `selectStoryCards`, `slugify`, `canonicalPath`, sitemap.
- Cung cấp: hết Giai đoạn 2.

## Todo List

- [x] Migration + shared
- [x] Core + API
- [x] Trang công khai + footer + sitemap
- [x] Khối tác giả + tab mod
- [x] i18n, docs, e2e, gate, `[x]` checkbox 6

## Success Criteria

- [x] Gate xanh
- [x] Mod tổ chức cuộc thi trọn vòng (tạo → nhận bài → kết thúc → gán hạng), có log
- [x] Trang cuộc thi công khai cache được, không có 18+, không có nội dung tài khoản bị ban
- [x] Checkbox 6 spec `[x]`; plan Giai đoạn 2 hoàn tất

## Risk Assessment

- Phase lớn nhất của plan (migration + 3 bề mặt UI). Nếu cook vượt sức một context: làm trọn core + API + trang công khai + tab mod trước, khối tác giả sau; không bỏ phần nào khỏi checkbox.
- Cuộc thi không có bài dự thi đủ tiêu chuẩn chất lượng → mod chấm tay, đúng phạm vi năm đầu.

## Security Considerations

- Mô tả cuộc thi là văn bản thuần (`normalizePlainText`, render text node, không HTML).
- Route mod sau `requireRole('mod','admin')` + `canModerate`; route tác giả kiểm `canEditStory`.

## Implementation Notes (cook)

Lệch nhỏ so với plan, tự chọn khi user ngủ:

- [auto] `contestStatus` đặt ở `packages/shared/src/schemas/contest.ts` (test ở `contest.test.ts`) thay vì `core/contests/contest-status.ts`. Lý do: hàm thuần, core dùng và web dùng được, tránh file một hàm.
- [auto] Lỗi `CONTEST_STORY_INELIGIBLE` không kèm lý do trong body; lý do (`not_published`/`mature`/`too_old`) trả ở `GET /contests/open`, khối tác giả hiện trước khi bấm. Lý do: giữ dạng lỗi thống nhất `{ error: { code, message } }`.
- [auto] Rút bài chỉ cần đăng nhập (`requireAuth`), tham gia cần email đã xác thực. Lý do: không thể đã tham gia mà chưa xác thực; rút không đăng nội dung.
- [auto] Bài được liệt kê = `publicStoryWhere({ includeMature: false })` + có chương (`last_chapter_at` not null), như trang tag. Danh sách bài cho mod hiện mọi bài kèm cờ `listed`; bài không còn công khai chỉ bỏ hạng được, không gán hạng.
- [auto] Chọn hạng bằng nhóm nút "Hạng 1/2/3 · Không xếp hạng" (`aria-pressed`) thay vì select. Lý do: một cú bấm như các hành động mod khác, e2e đơn giản.
- [auto] `catalogUrls` chỉ thêm `/contests` + trang cuộc thi khi truyện từng dự thi (không thêm cho mọi thay đổi). Lý do: purge đúng phạm vi, không đổi danh sách URL của truyện không dự thi.
- [auto] Slug duy nhất nhờ advisory lock trong transaction tạo; migration đổi tên `0008_contests.sql`.
- Sau review (`reports/code-reviewer-261006-phase-09-contests-review.md`): tham gia chạy trong transaction khoá chia sẻ hàng cuộc thi (chống đổi `starts_at` cùng lúc); truyện không còn chương = `not_published`; thời gian cuộc thi hiện kèm giờ.
- [auto] Cuộc thi đã có hạng không sửa được giờ kết thúc về tương lai (`INVALID_STATE`), bỏ hạng trước. Lý do: mở lại sẽ ẩn kết quả và cho rút bài có hạng không ghi log.
- [auto] Tab mod thứ tư làm hàng tab tràn ở 360px: hàng tab dạng viên cuộn trong hàng riêng như `/library` (`moderation-tab-links.tsx`).

## Next Steps

Hết Giai đoạn 2. Nhắc user: Giai đoạn 1 còn 2 checkbox hạ tầng (S3 MinIO thật, backup offsite trên VPS) trước khi mở public; Giai đoạn 3 chỉ làm khi được yêu cầu.
