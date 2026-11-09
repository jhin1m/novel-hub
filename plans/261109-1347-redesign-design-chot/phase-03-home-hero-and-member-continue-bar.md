---
phase: 3
title: "Hero trang chủ và thanh Đọc tiếp của thành viên"
status: done
priority: P1
effort: "4h"
dependencies: [1]
---

# Phase 3: Hero trang chủ và thanh Đọc tiếp của thành viên

**Status:** done

## Bối cảnh chung

- Repo `/Users/jhin1m/Desktop/ducanh-project/novel-hub`, nhánh `redesign/261109`. Không đổi nhánh, không push, không deploy, không đụng `dcn-prod`. Worker không commit; phiên điều phối chạy gate, đổi Status, đánh checkbox spec, commit.
- Trong code mọi thứ tiếng Anh; chuỗi hiển thị qua `packages/shared/messages/vi.json`, rồi `pnpm i18n:compile`. Không ghi số phase, tên plan trong code hay tên test.
- Logic nghiệp vụ trong `packages/core`, route không truy vấn DB. Không đổi schema. HTML không phụ thuộc cookie, hero không bao giờ là truyện 18+. Không gradient, không nền tím, không câu mở truyện hay khối trích dẫn.
- Brief mục 2. Board: `design-boards/Main.dc.html` dòng 47-81, `design-boards/Mobile.dc.html` dòng 29-56.
- Gate: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e`. Đỏ sau 2 lần sửa thì dừng, hỏi user. Cần đổi schema thì dừng, hỏi user.

## Overview

Hero toàn chiều rộng, nền là bìa làm mờ bằng CSS. Truyện chưa có bìa dùng bố cục nền ngà. Khối "Đọc tiếp" của thành viên thành một thanh đè mép dưới hero.

## Requirements

**Có bìa:** `section` nền `--hero-base` (#241d18), `overflow-hidden isolate`. `<img>` absolute cover, `object-position: center 68%`, `blur(36px)` (mobile 28px), `saturate(.85)`, `scale(1.18)`, ảnh bìa cỡ 300. Lớp phủ trơn `rgba(22,17,13,.64)`.

Padding desktop `clamp(40px,6vw,72px)` trên, `clamp(16px,4vw,32px)` hai bên, 112px dưới; mobile `26px 16px 78px`.

Nội dung theo thứ tự: nhãn "Mới đáng chú ý · thể loại · N chương" (mobile bỏ số chương), tên truyện `clamp(36px,4.6vw,62px)` 700 tracking -0.02em, "của {tác giả}" (mobile "{tác giả} · N chương"), giới thiệu tối đa 3 dòng, nút "Đọc ngay" nền `--cover-fg` chữ #2b2722 weight 800 cao 52 (mobile 44), "Thêm vào tủ" viền 1.5px (ẩn trên mobile). Bìa bên phải rộng 290px, xoay -2.5deg, bóng `0 26px 54px` đen 45%. Mobile bìa 88px bên trái tên truyện, không xoay.

**Không có bìa:** nền ngà không khối màu, chữ `--foreground`, bìa dạng chữ bên trái, nút màu nhấn.

**Chữ trên nền mờ chỉ dùng `--cover-fg`**, không dùng `#efe6d4` của board cho nhãn. Phép tính: lớp phủ .64 trên ảnh trắng tuyệt đối cho `#6a6764`, `--cover-fg` đạt 4,99:1, còn `#efe6d4` chỉ 4,53:1 và guideline cấm hạ màu chữ trên hero.

**Thanh thành viên:** `aside` nhãn "Đọc tiếp", nền `--card`, viền, bo 22px, padding `16px 22px`, `relative z-10 -mt-14` đè hero (mobile bo 20, padding `12px 14px`, `-mt-[50px]`). Gồm bìa 54px (mobile 44px), "Bạn đang đọc dở", "Tên truyện · Chương N", thanh tiến độ 5px theo `scrollPct`, pill "Đọc tiếp". Chỉ một truyện gần nhất, giữ lọc 18+ của `continueRows`. Placeholder cùng khung, cùng `z-10`, không chứa chữ.

**Bố cục trang:** hero sát header, không có `py` và `gap` bao ngoài hero. Hero không bìa không có đáy tối để đè nên `overlapHero` chỉ bật khi truyện có bìa; không đè thì thanh dùng margin thường.

## Key Insights

- `StoryCardDto` không có `synopsis` và số chương đầu. Số chương có thể cách quãng nên không tự suy ra chương 1. Core trả sẵn `hero` đủ dữ liệu, tránh gửi giới thiệu của cả danh sách `notable`.
- Chọn hero một nơi: core lấy truyện đầu của `notable` có `chapterCount > 0`. Bỏ `pickHero` ở web cùng test của nó.
- Ảnh nền cỡ 300 phóng to bị phạt diện tích LCP, nên `fetchPriority="high"` đặt ở bìa trước (`StoryCover priority`); ảnh nền `loading="eager"`, không `fetchPriority`.
- Mép blur mờ về nền dark của section chứ không sáng lên, nên giữ `scale(1.18)` đúng brief.
- Bo góc và `filter` trên Safari cần `isolate`; hero tràn viền chưa cần nhưng `CoverBackdrop` dùng lại ở ô thể loại.
- Giữ cơ chế hint `data-continue-rows` có sẵn, chỉ hạ `CONTINUE_ROWS_MAX` về 1. Margin âm đặt trên chính thanh và placeholder, không đặt trên wrapper, vì placeholder `display:none` thì wrapper rỗng sẽ kéo nội dung lên 56px.

## Related Code Files

| File | Việc | Test bị ảnh hưởng |
|------|------|--------------------|
| `apps/web/src/components/cover-backdrop.tsx` | Tạo | test mới |
| `apps/web/src/components/home/home-featured-hero.tsx` | Viết lại, 2 biến thể | test mới |
| `apps/web/src/components/home/home-continue-reading.tsx` | Thành thanh một dòng, placeholder cùng khung | `e2e/catalog.spec.ts:296` |
| `apps/web/src/components/library/continue-reading-button.tsx` | `ResumeLink` thêm prop `label` | `e2e/library.spec.ts:71` phải giữ nguyên |
| `apps/web/src/routes/index.tsx` | Hero ra ngoài container, thanh ngay sau hero | `e2e/catalog.spec.ts` |
| `apps/web/src/styles/tokens.css`, `token-values.ts` | `--hero-base`, `--hero-ink` #2b2722, `--hero-scrim: rgb(22 17 13 / 0.64)` | `tokens.test.ts` |
| `apps/web/src/styles/tokens.test.ts` | Thêm test `--cover-fg` trên phủ-trên-trắng ≥ 4.5 | |
| `apps/web/src/styles/app.css:185-186` | Bỏ 2 selector `.continue-hint-row` | |
| `apps/web/src/lib/account-hint.ts` | `CONTINUE_ROWS_MAX = 1` | `account-hint.test.ts` (7) |
| `apps/web/src/lib/boot-script.test.ts:93-97,220-221` | Fixture `continueRows: 2` thành 1, kỳ vọng tương ứng; `3` và `4` thành ca "quá giới hạn" | 15 test |
| `apps/web/src/lib/home.ts`, `home.test.ts` | Xóa `pickHero`; `continueRows` mặc định còn 1 | 5 test |
| `packages/core/src/catalog/home.ts` | `loadHomeHero(db, card)` | |
| `packages/core/src/catalog/home-page.ts` | Thêm `hero` | `catalog.int.test.ts` (22) |
| `packages/core/src/index.ts` | Export type `HomeHero` | |
| `packages/shared/messages/vi.json` | `home_featured_view` "Đọc ngay", `home_featured_by` "của {name}", `home_continue_lead` "Bạn đang đọc dở", `home_continue_action` "Đọc tiếp" | |

## Architecture

```ts
// packages/core/src/catalog/home.ts
export type HomeHero = StoryCardDto & {
  synopsis: string | null;
  firstChapterNumber: number | null; // published, undeleted
};
export async function loadHomeHero(db: Db, card: StoryCardDto): Promise<HomeHero>;
```

Một truy vấn theo `public_id`, subquery `min(number)` trên chapters `status = 'published' and deleted_at is null`. `getHomePage` gọi sau `Promise.all`, với truyện đầu của `notable` có `chapterCount > 0`; `HomePageData.hero` là `HomeHero | null`.

```tsx
// apps/web/src/components/cover-backdrop.tsx: decorative only, the section sets the base colour
<img src={coverImageUrl(coverUrl, 300)} alt="" aria-hidden width={300} height={450}
  loading={eager ? 'eager' : 'lazy'} decoding="async"
  className="absolute inset-0 size-full scale-[1.18] object-cover object-[center_68%] blur-[28px] saturate-[.85] md:blur-[36px]" />
<div aria-hidden className="absolute inset-0 bg-(--hero-scrim)" />
```

Hero dùng một DOM cho bìa, đổi chỗ bằng grid areas: mobile `"label label" "cover title" "syn syn" "cta cta"`, từ `md` `"label cover" "title cover" "syn cover" "cta cover"`.

## Implementation Steps

1. Thêm token và test tương phản.
2. Core: `loadHomeHero`, nối vào `getHomePage`, int test: giới thiệu đúng truyện, `firstChapterNumber` bỏ qua chương đã xóa mềm và chương nháp.
3. Tạo `CoverBackdrop`.
4. Viết lại `HomeFeaturedHero({ story })` với `story: HomeHero`. `routes/index.tsx` dùng `hero` từ loader, cả trong `claimSections`. Giữ `id="featured-title"` trên h2 và link tiêu đề. "Đọc ngay" tới chương `firstChapterNumber`, không có thì tới trang truyện. `LibraryButton tone="on-cover"`; đặt `--story-tint: var(--hero-ink)` trên section để `ON_COVER_SOLID` đúng màu. Không bìa: `tone="default"`, `Button` nhấn.
5. `HomeContinueReading`: thanh một dòng, `ResumeLink label={m.home_continue_action()}`, giữ `aria-label` đầy đủ từ `continue_reading`. Placeholder cùng kích thước, cùng margin âm.
6. `routes/index.tsx`: bỏ `py` và `gap` phía trên hero; hero ra ngoài khung 1240, thanh trong khung ngay sau, các khu còn lại có khoảng cách riêng. `overlapHero={hero?.coverUrl != null}`.
7. Hạ `CONTINUE_ROWS_MAX`, sửa test.

## Test Matrix

| Mức | Kịch bản | Nơi |
|-----|----------|-----|
| Critical | HTML `/` không chứa truyện 18+ dù truyện đó mới nhất; không `set-cookie`; `Cache-Control` như cũ | `e2e/catalog.spec.ts` |
| Critical | `--cover-fg` trên phủ-trên-trắng ≥ 4.5 | `tokens.test.ts` |
| High | Có bìa: có ảnh nền `alt=""` cỡ 300, có nút Đọc ngay trỏ chương đầu | test component mới |
| High | Không bìa: không có ảnh nền, có bìa chữ | test component mới |
| High | Thanh thành viên: chỉ truyện gần nhất, truyện 18+ bị lọc khi chưa bật | `e2e/catalog.spec.ts:285-305` |
| High | `hero.firstChapterNumber` với chương đầu đã xóa mềm | `catalog.int.test.ts` |
| Medium | Hint 1 dòng: placeholder hiện trước khi vẽ, không hint thì ẩn | `boot-script.test.ts` |

## Interface Checklist

- [ ] `HomeHero`, `loadHomeHero`, `HomePageData.hero`
- [ ] `CoverBackdrop({ coverUrl, eager })`
- [ ] `HomeFeaturedHero({ story })`
- [ ] `ResumeLink.label`
- [ ] `HomeContinueReading({ overlapHero })`

## Dependency Map

Cần font phase 1. `CoverBackdrop` dùng ở phase 4, 6. Thanh được phase 9 thêm nguồn dữ liệu khách.

## Success Criteria

- [ ] Hero có bìa, hero không bìa khớp board ở 1440 và 390
- [ ] Không có gradient, không `backdrop-filter`
- [ ] HTML vẫn cache công khai, không chứa dữ liệu cá nhân
- [ ] Gate xanh

## Risk Assessment

- Blur lớn trên máy yếu: phần tử tĩnh, không animate, không `will-change`.
- Ảnh nền lỗi tải: `alt=""` không vẽ gì, nền `--hero-base` giữ chữ đạt AA.
- Hero đổi sang 18+ ở client: `hero` đến từ loader, không qua `useMatureAwareList`.
- Hero `isolate` tạo stacking context: thanh và thẻ đè lên phải có `relative z-10`.
