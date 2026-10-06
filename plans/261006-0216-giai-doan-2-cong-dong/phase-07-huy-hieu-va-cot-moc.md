---
phase: 7
title: "Huy hiệu và cột mốc"
status: completed
priority: P2
effort: "0.75d"
dependencies: [6]
---

# Phase 7: Huy hiệu và cột mốc

<!-- Red Team: bỏ thông báo huy hiệu, queue maintenance, đếm follower đã xác thực + không bị ban, catalog tự đảm bảo trước khi trao -->

## Context Links

- Spec: §5 Gđ2 checkbox 6 (phần "Huy hiệu và cột mốc"), §1 ("Tác giả thấy có người đọc"), §4 (`badges`, `user_badges` thiết kế sẵn)
- Phase 3: `follows`, queue `maintenance`
- Scout: backend §1 (`badges.code` unique, `user_badges` PK (user_id, badge_id))
- Research: `research/researcher-03-badges-featured-contests.md` §1 (chọn quét định kỳ thay vì outbox)

## Overview

8 huy hiệu cột mốc cho tác giả, trao tự động bởi job quét 30 phút trên queue `maintenance`. Trang tác giả hiện hàng huy hiệu. Không gửi thông báo (spec không yêu cầu). Checkbox 6 **chưa** `[x]`.

## Key Insights

- `badges(id, code unique, name, description, created_at)`, `user_badges(user_id, badge_id, awarded_at)` PK (user_id, badge_id) (`packages/db/src/schema/engagement.ts:76-106`) → `INSERT … ON CONFLICT DO NOTHING` idempotent, không cần migration.
- `stories.chapter_count` chỉ đếm chương đã đăng chưa xoá (`packages/core/src/publishing/counters.ts:10-19`), `stories.word_count` có sẵn → điều kiện tác giả tính bằng `sum` trên truyện công khai.
- Đăng nhập không cần email đã xác thực (`packages/auth/src/auth.ts:140`) → follower ảo dễ tạo; huy hiệu người theo dõi chỉ đếm follower **đã xác thực, không bị ban**.
- E2E `truncateAll` xoá cả bảng `badges` (`apps/web/e2e/global-setup.ts:16`) → `awardMilestoneBadges` tự gọi `ensureBadgeCatalog` trước khi trao.
- Chuỗi hiển thị qua Paraglide → tên/mô tả huy hiệu là key i18n theo `code`; cột `name`/`description` trong DB ghi tiếng Anh ngắn để tham khảo, UI không đọc.
- Trang tác giả SSR cache 10 phút (`routes/authors.$username.tsx:31`) → huy hiệu đưa vào SSR được (công khai, chậm ≤ 10 phút + SWR chấp nhận).

## Requirements

**Functional**
- Danh mục (hằng `BADGES` ở `packages/shared/src/badges.ts`), chỉ tính truyện công khai (`publicStoryWhere({includeMature:true})`) và tác giả không bị ban:

| code | Điều kiện |
|---|---|
| `first_chapter` | tổng `chapter_count` ≥ 1 |
| `chapters_10` | ≥ 10 |
| `chapters_100` | ≥ 100 |
| `words_100k` | tổng `word_count` ≥ 100.000 |
| `words_1m` | ≥ 1.000.000 |
| `followers_10` | số `follows` target `user` = tác giả, người theo dõi `email_verified` và `status <> 'banned'`, ≥ 10 |
| `followers_100` | ≥ 100 |
| `story_completed` | có ≥ 1 truyện `status = 'completed'` với `chapter_count` ≥ 1 |

- Huy hiệu đã trao không thu hồi.
- Trang tác giả: khu nhỏ dưới bio, danh sách huy hiệu (icon lucide + tên; mô tả trong `title` + `sr-only`), theo thứ tự danh mục. Không có huy hiệu → không render khu.

**Non-functional**
- Job `award-badges` (queue `maintenance`, repeat 30 phút): `ensureBadgeCatalog`, rồi mỗi badge **một câu** `INSERT INTO user_badges … SELECT … ON CONFLICT DO NOTHING` tự commit (không transaction dài).
- `ensureBadgeCatalog(db)`: upsert danh mục vào `badges` theo `code`. Gọi nền khi worker khởi động (như `applySearchSettingsAtBoot`) và đầu mỗi lần job chạy.
- Không thêm migration.

## Architecture

```
worker boot → ensureBadgeCatalog(db)
maintenance queue: award-badges (30 phút) → awardMilestoneBadges(db)
  ensureBadgeCatalog(db)
  for badge in BADGES: INSERT INTO user_badges(user_id, badge_id)
                       SELECT author_id, $badgeId FROM (<badgeRuleQuery(rule)>) q ON CONFLICT DO NOTHING
getAuthorPage → + badges: listUserBadges(db, authorId) → [{code, awardedAt}]
```

- `BADGES: ReadonlyArray<{ code; rule: {kind:'chapters'|'words'|'followers', min:number} | {kind:'completed_story'} }>`; `BadgeCode` suy ra từ mảng.
- `badgeRuleQuery(rule)` dùng Drizzle `sql` có tham số, không nối chuỗi.

## Related Code Files

| Hành động | File |
|---|---|
| Create | `packages/shared/src/badges.ts` (+ test: code duy nhất, ngưỡng tăng dần theo nhóm); Modify `queues.ts` (`MAINTENANCE_JOBS.awardBadges`), `src/index.ts` |
| Create | `packages/core/src/badges/badge-catalog.ts` (`ensureBadgeCatalog`), `award-badges.ts`, `user-badges.ts`, `badges.int.test.ts` |
| Modify | `packages/core/src/catalog/author-page.ts` (+ int test) thêm `badges`; `core/src/index.ts` |
| Create | `apps/worker/src/processors/award-badges.ts`; Modify `maintenance-worker.ts` (scheduler 30 phút) + `maintenance-worker.int.test.ts`, `index.ts` (ensure nền khi boot) |
| Create | `apps/web/src/components/badges/badge-list.tsx`, `badge-icons.ts` (map code → icon lucide, nhãn → `m.badge_*`) (+ test render) |
| Modify | `apps/web/src/routes/authors.$username.tsx` |
| Modify | `packages/shared/messages/vi.json` (`badge_<code>_name`, `badge_<code>_description`, `badge_section_title`) |
| Create | `apps/web/e2e/badges.spec.ts` (helper gọi `awardMilestoneBadges` qua core) |

## Function / Interface Checklist

- [x] `BADGES`, `BADGE_CODES`, `type BadgeCode`
- [x] `ensureBadgeCatalog(db) → Promise<void>`
- [x] `awardMilestoneBadges(db) → Promise<number>` (số dòng mới)
- [x] `listUserBadges(db, userId) → Promise<Array<{ code: BadgeCode, awardedAt: string }>>` (bỏ code không còn trong danh mục)
- [x] `<BadgeList badges />`

## Implementation Steps

1. Shared: danh mục + type + tên job; unit test.
2. Core: catalog upsert; rule SQL; award; int test: tác giả 1 truyện 12 chương → `first_chapter`, `chapters_10`; chạy lại không trao lặp; tác giả bị ban không nhận; truyện nháp không tính; 10 follower trong đó 1 chưa xác thực → chưa có `followers_10`; truyện completed → `story_completed`; bảng `badges` rỗng trước khi chạy → vẫn trao được.
3. Trang tác giả: `getAuthorPage` thêm `badges`.
4. Worker: processor + scheduler + boot ensure.
5. Web: `BadgeList` (pill nhỏ nền `--secondary`, icon 16px, chữ 13px; không dùng `--primary` vì không phải hành động), i18n.
6. E2E: tác giả có 10 chương → helper chạy award → trang tác giả hiện huy hiệu "10 chương".
7. Gate xanh. Checkbox 6 giữ `[ ]`.

## Test Scenario Matrix

| Mức | Kịch bản |
|---|---|
| Unit | `BADGES` code duy nhất, ngưỡng tăng dần |
| Int (core) | bước 2; `listUserBadges` bỏ code lạ |
| Unit (web) | `BadgeList` rỗng → `null`; 2 huy hiệu → 2 mục với nhãn đúng |
| E2E | bước 6 |

## Dependency Map

- Cần: phase 3 (`follows`, queue `maintenance`), `publicStoryWhere`.
- Cung cấp: không phase sau phụ thuộc.

## Todo List

- [x] Shared danh mục
- [x] Core award + catalog + author page
- [x] Worker
- [x] UI + i18n
- [x] E2E, gate

## Success Criteria

- [x] Gate xanh
- [x] Job trao đúng, idempotent; trang tác giả hiện huy hiệu
- [x] Checkbox 6 vẫn `[ ]`

## Risk Assessment

- Trao chậm tới 30 phút → chấp nhận.
- Follower ảo đã xác thực email vẫn có thể; huy hiệu không thu hồi → chấp nhận năm đầu (mod ban tài khoản ảo không gỡ huy hiệu đã trao).

## Security Considerations

- Rule SQL tham số hoá; không nhận input người dùng.

## Cook Log (2026-10-06, chế độ tự động)

- Gate xanh: typecheck, lint, format:check, test 776, test:int 389 (+1 skip S3), test:e2e 108 (sau sửa review chạy lại typecheck/lint/format/test/test:int + `e2e/badges.spec.ts`).
- [auto] `BadgeList` là `<ul aria-label="Huy hiệu">` đặt ngay dưới bio, không heading riêng. Lý do: khu nhỏ trong header tác giả, plan ghi "khu nhỏ dưới bio".
- [auto] Icon: PenLine, BookOpen, LibraryBig, Type, ScrollText, Users, UsersRound, BookCheck. Lý do: lucide có sẵn, trung tính.
- [auto] Giữ huy hiệu tính cả truyện 18+ (theo plan `includeMature:true`); câu hỏi mở cho user.
- Review: `reports/code-reviewer-261006-badges-review-report.md` (0 Critical/High/Medium; sửa Low 2).
- Docs: `docs/moderation-guide.md` thêm mục huy hiệu (không thu hồi).

## Next Steps

Phase 8: truyện nổi bật do mod chọn.
