---
phase: 8
title: "Truyện nổi bật do mod chọn"
status: pending
priority: P2
effort: "0.75d"
dependencies: [7]
---

# Phase 8: Truyện nổi bật do mod chọn

<!-- Red Team: một slot `home_picks`, không đổi hero và không sửa spec §8, mod không tự chọn truyện của mình, từ vựng log chỉ-ghi-log -->

## Context Links

- Spec: §5 Gđ2 checkbox 6 (phần "khu truyện nổi bật do mod chọn"), §4 (`featured_slots(id, story_id, slot, starts_at, ends_at)`), §7 (18+ không xuất hiện ở khu truyện nổi bật; mọi hành động mod ghi `moderation_actions`), §8 (hero trang chủ "Mới đáng chú ý", không banner — giữ nguyên)
- Phase 1: `MODERATION_LOG_ACTIONS`, guard mod
- Scout: backend §1 (`featured_slots` CHECK ends > starts, index (slot, starts_at)), §6, §9; frontend §4 (home), §8 (`/moderation` tab)
- Research: `research/researcher-03-badges-featured-contests.md` §2

## Overview

Mod chọn truyện vào khu "Truyện nổi bật" trên trang chủ (tối đa 12, có thời gian bắt đầu/kết thúc). Hero trang chủ **giữ nguyên** "Mới đáng chú ý" tự động (spec §8 vừa chốt ở commit `6868c85`). Tab mới "Nổi bật" trong `/moderation`. Checkbox 6 **chưa** `[x]`.

## Key Insights

- Trang chủ: `getHomePage` (`packages/core/src/catalog/home.ts:94-106`) trả `{recent, notable, genres}`; `routes/index.tsx` render hero (`pickHero(notable)`), "Mới cập nhật", dải `bg-band` "Truyện mới đáng chú ý".
- Cache trang chủ `publicPageHeaders(status,{list:true})` = 10 phút + `stale-while-revalidate` 1 giờ (`apps/web/src/lib/cache-headers.ts:16-18`); trang chủ đã được purge mỗi khi truyện/chương/user đổi (`core/src/catalog/urls.ts:15-31`) → truyện bị ẩn/ban biến khỏi khu nổi bật ngay; thay đổi slot thì có hiệu lực theo TTL (không purge riêng). [auto]
- `logModerationAction` nhận `ModerationLogAction` (phase 1) → `feature_story`/`unfeature_story` thêm vào `MODERATION_LOG_ACTIONS`, **không** vào `MODERATION_ACTIONS` (không phải one-click từ hàng chờ, không cần `ACTION_LABELS`/`dispatch`).
- `/moderation` (`routes/moderation.tsx`, `ssr:false`) tab qua `moderation-tab-links.tsx`; API `routes/moderation.ts` sau `requireRole('mod','admin')`.

## Requirements

**Functional**
- `FEATURED_SLOTS = ['home_picks']` (text + Zod; chừa đường slot khác sau).
- Mod tạo slot: nhập link truyện hoặc `publicId` (parse bằng `parseStoryKey`/`isValidPublicId`), `startsAt` (mặc định bây giờ), `endsAt` (mặc định +7 ngày); form theo giờ `Asia/Ho_Chi_Minh`, gửi ISO có offset.
  - Từ chối: truyện không công khai hoặc chưa có chương (`NOT_FOUND`), **18+** (`FEATURED_MATURE` 422), **truyện của chính mod** (`FORBIDDEN`), `endsAt ≤ startsAt` hoặc khoảng > 90 ngày (400 validate).
- Danh sách cho mod: đang hiệu lực, sắp tới, đã kết thúc 30 ngày gần nhất; mỗi dòng: bìa nhỏ, tên truyện, thời gian, nút "Kết thúc ngay" (đang hiệu lực → `ends_at = now()`) / "Xoá" (chưa bắt đầu → delete; đã bắt đầu → `INVALID_STATE` 409).
- Mọi tạo/kết thúc/xoá ghi `moderation_actions` (target `{type:'story', id}`, action `feature_story` / `unfeature_story`, note = khoảng thời gian).
- Trang chủ: khu "Truyện nổi bật" (`SectionHeading` + `StoryGrid scroll`) đặt ngay dưới hàng hero; slot đang hiệu lực, `starts_at desc`, bỏ trùng truyện, tối đa 12, bỏ truyện đang là hero; ẩn khu khi rỗng. Lúc đọc lọc `publicStoryWhere({includeMature:false})` + có chương.

**Non-functional**
- Không purge riêng, không job mới, không migration.

## Architecture

```
/moderation?tab=featured → FeaturedSlotForm + FeaturedSlotList
  GET    /api/v1/moderation/featured
  POST   /api/v1/moderation/featured        {story, startsAt, endsAt}
  POST   /api/v1/moderation/featured/:id/end
  DELETE /api/v1/moderation/featured/:id    (chỉ khi chưa bắt đầu)
core/featured: createFeaturedSlot, endFeaturedSlot, deleteFeaturedSlot, listFeaturedSlotsForMods, listActiveFeatured(db, now)
getHomePage(db) → + picks: StoryCardDto[]
routes/index.tsx: <HomeFeaturedPicks stories={picks without hero} />
```

## Related Code Files

| Hành động | File |
|---|---|
| Create | `packages/shared/src/schemas/featured.ts` (+ test): `FEATURED_SLOTS`, `featuredSlotCreateSchema` (refine `endsAt > startsAt`, ≤ 90 ngày), DTO |
| Modify | `packages/shared/src/schemas/reports.ts` (+ `reports.test.ts`): `MODERATION_LOG_ACTIONS` thêm `feature_story`, `unfeature_story` |
| Create | `packages/core/src/featured/featured-slots.ts`, `active-featured.ts`, `featured.int.test.ts`; Modify `core/src/index.ts` |
| Modify | `packages/core/src/catalog/home.ts` (+ int test) thêm `picks` |
| Modify | `packages/api/src/routes/moderation.ts` (+ int test), `lib/core-errors.ts` (`FEATURED_MATURE` 422) |
| Modify | `apps/web/src/lib/moderation.ts` (hook slot), `components/moderation/moderation-tab-links.tsx`, `routes/moderation.tsx` (tab `featured`) |
| Create | `apps/web/src/components/moderation/featured-slot-form.tsx`, `featured-slot-list.tsx`, `apps/web/src/lib/vn-datetime.ts` (+ test: `datetime-local` giờ VN ↔ ISO; phase 9 dùng lại) |
| Create | `apps/web/src/components/home/home-featured-picks.tsx`; Modify `routes/index.tsx` |
| Modify | `packages/shared/messages/vi.json` (`featured_*`, `home_picks_*`, `moderation_tab_featured`) |
| Create | `apps/web/e2e/featured.spec.ts` |
| Modify | `docs/moderation-guide.md` |

## Function / Interface Checklist

- [ ] `createFeaturedSlot(tx, actor, input) → Result<FeaturedSlotDto, 'NOT_FOUND'|'FORBIDDEN'|'FEATURED_MATURE'>`
- [ ] `endFeaturedSlot(tx, actor, id)`, `deleteFeaturedSlot(tx, actor, id)` → `'NOT_FOUND'|'INVALID_STATE'`
- [ ] `listFeaturedSlotsForMods(db, now)`
- [ ] `listActiveFeatured(db, now, limit = 12) → StoryCardDto[]`
- [ ] `toVnDateTimeLocal(iso)`, `fromVnDateTimeLocal(value) → ISO` (thuần)

## Implementation Steps

1. Shared schema + log actions + test.
2. Core: tạo/kết thúc/xoá (kiểm `canModerate`, chặn truyện của chính mod, ghi log trong cùng transaction); `listActiveFeatured` (`starts_at <= now < ends_at`, `selectStoryCards` + `publicStoryWhere({includeMature:false})` + `last_chapter_at is not null`, distinct theo truyện); `getHomePage` gọi nó. Int test: 18+ bị từ chối; truyện của mod bị từ chối; truyện bị ẩn sau khi chọn không hiện; slot hết hạn không hiện; log có dòng.
3. API: 4 route mod + int test (reader 403, xoá slot đã bắt đầu 409).
4. Web moderation: tab "Nổi bật", form (input link/publicId, hai ô `datetime-local`, nút Lưu), danh sách 3 nhóm + hành động (kết thúc dùng `ConfirmDialog`).
5. Web trang chủ: khu picks dưới hàng hero, bỏ truyện đang là hero.
6. i18n, moderation-guide, e2e: mod chọn truyện B → trang chủ có khu "Truyện nổi bật" chứa B (e2e chạy dev không CDN nên thấy ngay); mod kết thúc → khu biến mất; chọn truyện 18+ → lỗi hiển thị.
7. Gate xanh. Checkbox 6 giữ `[ ]`.

## Test Scenario Matrix

| Mức | Kịch bản |
|---|---|
| Unit | schema: ends ≤ starts, > 90 ngày; `vn-datetime` chuyển đổi hai chiều |
| Int (core) | bước 2 |
| Int (api) | bước 3 |
| E2E | bước 6 |

## Dependency Map

- Cần: phase 1 (`MODERATION_LOG_ACTIONS`), tab moderation, `canModerate`, `logModerationAction`, `selectStoryCards`, `publicStoryWhere`, `parseStoryKey`.
- Cung cấp: mẫu tab mod + `vn-datetime` cho phase 9.

## Todo List

- [ ] Shared + core + API
- [ ] Tab mod
- [ ] Khu trang chủ
- [ ] i18n, docs, e2e, gate

## Success Criteria

- [ ] Gate xanh
- [ ] Mod chọn/kết thúc/xoá slot, có log; hero trang chủ và spec §8 không đổi
- [ ] Không truyện 18+ nào vào khu nổi bật
- [ ] Checkbox 6 vẫn `[ ]`

## Risk Assessment

- Slot mới/kết thúc hiện trên production sau tối đa TTL list (10 phút, tới ~70 phút với SWR) → ghi trong moderation-guide; muốn ngay thì `pnpm cdn:purge` trang chủ (lệnh hiện có chỉ purge theo truyện → ngoài phạm vi, ghi chú).
- Đổi hero sang truyện mod chọn: Validation Session 1 [auto] giữ hero tự động (spec §8); muốn đổi thì user sửa spec trước, không làm ở phase này. <!-- Updated: Validation Session 1 - giữ hero tự động -->

## Security Considerations

- Mọi route sau `requireRole('mod','admin')` + `canModerate` ở core.

## Next Steps

Phase 9: cuộc thi theo chủ đề.
