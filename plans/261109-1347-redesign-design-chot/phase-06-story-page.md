---
phase: 6
title: "Trang truyện"
status: done
priority: P1
effort: "4h"
dependencies: [3, 5]
---

# Phase 6: Trang truyện

**Status:** done

## Bối cảnh chung

- Repo `/Users/jhin1m/Desktop/ducanh-project/novel-hub`, nhánh `redesign/261109`. Không đổi nhánh, không push, không deploy, không đụng `dcn-prod`. Worker không commit; phiên điều phối chạy gate, đổi Status, đánh checkbox spec, commit.
- Trong code mọi thứ tiếng Anh; chuỗi hiển thị qua `packages/shared/messages/vi.json`, rồi `pnpm i18n:compile`. Không ghi số phase, tên plan trong code hay tên test.
- HTML không phụ thuộc cookie, loader không đọc session. Màn 18+ giữ nguyên. Không gradient, không nền tím, không serif.
- Brief mục 3. Board: `design-boards/Story.dc.html`. Chỗ board khác brief thì theo brief.
- Gate: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e`. Đỏ sau 2 lần sửa thì dừng, hỏi user.

## Overview

Thay dải màu tag chính bằng nền bìa mờ như hero trang chủ. Giới thiệu lên đầu nội dung. Sidebar theo board.

## Requirements

**Hero có bìa** (dùng `CoverBackdrop eager`): padding `22px` trên, 104px dưới. Breadcrumb 14px. Bìa 240px xoay -2deg, bóng `0 24px 50px` đen 45%. Dòng "thể loại · trạng thái", thêm " · AI", " · 18+" khi có. h1 `clamp(40px,5vw,66px)` 700 tracking -0.02em. "của {tác giả}". Số liệu: nhãn 13px trên, giá trị 22px 700 dưới, `gap: 14px 36px`, không vạch ngăn. Nút cao 52 (Đọc từ đầu nền `--cover-fg`; Thêm vào tủ, Theo dõi, Đề cử viền 1.5px). Chữ chỉ dùng `--cover-fg`.

**Số liệu:** chương, chữ, ra chương, cập nhật, như hiện tại. Không thêm "đánh giá" của board: spec mục 8 ghi tần suất ra chương, brief không đổi điểm này, và dự án quy định spec thắng khi mâu thuẫn. Phase 8 ghi đây là lệch chờ user xác nhận.

**Hero không bìa:** cùng cách với trang chủ: nền ngà, không khối màu, chữ `--foreground`, bìa chữ, `tone="default"` cho các nút.

**Nội dung:** thẻ nền `--card`, bo 28, `-mt-16` đè hero, padding `clamp(22px,3.4vw,40px)`, các khu cách 38. Thứ tự: **Giới thiệu** đầu tiên, thông báo tác giả, tag, Mục lục, đánh giá, thảo luận. h2 26px 700. Giới thiệu 17px/1.75 font giao diện.

**Mục lục:** giữ tìm kiếm, đảo chiều, nhảy tới chương đang đọc. Giữ hàng "Mới nhất" nền `--primary-soft`; danh sách có vạch ngăn `--band` như board.

**Sidebar:** thẻ tác giả; h2 "Truyện liên quan" 26px, lưới 3 cột bìa dùng `StoryShelfCard compact` đã có từ phase 5, tối đa 6 truyện, cùng tác giả trước, cùng tag sau, không tiêu đề nhóm; thẻ "Độc giả gắn bó" nền `--card`, bo 24, padding 20, h2 22px, thứ hạng màu nhấn.

**Dưới `md`** (số desktop ở trên chỉ áp từ `md`): bìa 132px bên cạnh tên, không xoay; h1 28px/1.25 700, `text-balance`, không `wrap-anywhere` giữa từ trừ khi từ dài hơn cột; padding dưới hero 52px; thẻ nội dung `-mt-7`, bo trên 28px như hiện tại; nút trên hero cao 44; nút đọc nằm ở thanh dính đáy, như hiện tại. Số liệu và các nút xếp toàn chiều rộng dưới bìa.

Thẻ nội dung có `relative z-10` vì hero `isolate` tạo stacking context.

## Key Insights

- `ON_COVER_SOLID` lấy màu chữ từ `--story-tint`: đặt `--story-tint: var(--hero-ink)` trên section hero để nút đặc vẫn đúng. Bỏ `coverColorVar` khỏi `story-hero.tsx`.
- `MatureGate` là lớp `fixed inset-0 bg-background`, che kín hero 18+; bìa vốn đã ở HTML trang này nên ảnh nền không mở rộng phạm vi lộ. Meta và preview 18+ không đổi.
- `RelatedStories` đang tải ở client và API đã lọc 18+, nên đổi trình bày không đụng chính sách.
- `TopReaders` trả `null` với truyện 18+: giữ.

## Related Code Files

| File | Việc | Test bị ảnh hưởng |
|------|------|--------------------|
| `apps/web/src/components/story/story-hero.tsx` | Viết lại, 2 biến thể | `e2e/stories.spec.ts` |
| `apps/web/src/components/story/on-cover-classes.ts` | Sửa comment | |
| `apps/web/src/components/story/story-meta.tsx` | Nhãn trên giá trị, bỏ `divide-x` | `.test.tsx` (2) |
| `apps/web/src/components/story/story-chapter-list.tsx` | Vạch ngăn dòng | `.test.tsx` (8), `e2e/toc.spec.ts` |
| `apps/web/src/components/story/story-author-card.tsx` | Khung theo board | |
| `apps/web/src/components/story/related-stories.tsx` | Lưới 3 cột, gộp nhóm | `e2e/story-page-sections.spec.ts:105-113` |
| `apps/web/src/components/nominations/top-readers.tsx` | Khung, tiêu đề | `e2e/nominations.spec.ts` |
| `apps/web/src/routes/stories.$storyKey.index.tsx` | Đổi thứ tự, khung | `e2e/story-page-sections.spec.ts` (11) |
| `packages/shared/messages/vi.json` | `story_hero_by` "của {name}", `story_shelf_ai` đã có; xóa `related_same_author`, `related_same_tag` | |

`StorySynopsis` đã đổi font ở phase 1; chỉ chỉnh cỡ nếu lệch.

## Implementation Steps

1. Viết lại `StoryHero`, chia `hasCover`. Grid giữ DOM một bìa. Giữ `id="story-title"`, `tabIndex={-1}` cho focus sau màn 18+. Giữ `ContinueReadingButton`, `LibraryButton`, `FollowButton`, `NominateButton` với tone theo biến thể.
2. Đổi `StoryMeta`.
3. Sửa `routes/stories.$storyKey.index.tsx`: đổi thứ tự, `-mt-16`, khung nội dung.
4. `RelatedStories`: `[...sameAuthor, ...sameMainTag].slice(0, 6)` sau khi bỏ trùng theo `publicId`. Giữ `useNearViewport`, ẩn khi rỗng.
5. Khung `TopReaders`, `StoryAuthorCard`, vạch danh sách chương.
6. Sửa e2e `Truyện liên quan`: kiểm truyện cùng tác giả đứng trước truyện cùng tag, không còn region theo nhóm.

## Test Matrix

| Mức | Kịch bản | Nơi |
|-----|----------|-----|
| Critical | HTML trang truyện cache công khai, không `set-cookie`, không chứa truyện liên quan | `e2e/story-page-sections.spec.ts:95-101` |
| Critical | Truyện 18+ vẫn hiện màn cảnh báo, không tải bình luận hay liên quan | `e2e/comments-mature.spec.ts`, `e2e/reader.spec.ts` |
| High | Giới thiệu đứng trước thông báo và mục lục trong DOM | `e2e/story-page-sections.spec.ts` |
| High | Có bìa có ảnh nền; không bìa không có | test component mới |
| High | Mục lục vẫn tìm, đảo, nhảy | `e2e/toc.spec.ts` |
| High | Truyện liên quan không có truyện 18+, tối đa 6 | `e2e/story-page-sections.spec.ts` |
| High | Tiêu đề 150 ký tự ở 390: không tràn ngang, không cắt giữa từ | `e2e/layout-polish.spec.ts` |
| Medium | Không tràn ngang ở 360 và 390 | `e2e/layout-polish.spec.ts` |

## Interface Checklist

- [ ] `StoryHero` (props giữ nguyên)
- [ ] `StoryMeta` (props giữ nguyên)
- [ ] `RelatedStories` (bỏ prop `mainTagName`, sửa nơi gọi ở `routes/stories.$storyKey.index.tsx`)

## Dependency Map

Cần `CoverBackdrop` và `--hero-*` của phase 3, `StoryShelfCard` của phase 5. Không phụ thuộc phase 4.

## Success Criteria

- [ ] Hero, nội dung, sidebar khớp board ở 1440; 390 giữ nút dính đáy
- [ ] Không còn `coverColorVar` trong `story-hero.tsx`
- [ ] Mọi nút hero đạt tương phản và focus thấy được
- [ ] Gate xanh

## Risk Assessment

- Dark mode: hero tự tối nên không đổi; nội dung dùng token.
- Bỏ tiêu đề nhóm khiến người đọc không phân biệt cùng tác giả và cùng thể loại: đúng board, thứ tự giữ tác giả trước.
