---
title: "Đưa design đã chốt của SayNovel vào code"
description: "Font Be Vietnam Pro, hero bìa mờ, ô thể loại, kệ truyện, trang truyện mới, thanh Đọc tiếp cho khách"
status: pending
priority: P1
effort: "28h"
branch: redesign/261109
tags: [frontend, design, home, story-page]
blockedBy: []
blocks: []
created: 2026-11-09
---

# Đưa design đã chốt của SayNovel vào code

## Overview

Làm theo brief `plans/reports/brief-261109-1347-redesign-design-chot-report.md`. Bản sao 3 board nằm ở `design-boards/` (Main, Story, Mobile), chỉ để tham khảo. Nhánh `redesign/261109`: không đổi nhánh, không push, không deploy, không đụng `dcn-prod`. Worker không commit; phiên điều phối chạy gate, đổi Status, đánh checkbox spec và commit sau mỗi phase.

Nghiên cứu: `research/researcher-01-font-and-blur-hero-report.md`, `research/researcher-02-guest-progress-merge-report.md`.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Trang chủ, trang truyện, header, footer khớp board ở 1440px và 390px, sáng và tối | P1 |
| 2 | HTML công khai vẫn cache được: không phụ thuộc cookie, không có truyện 18+ trong danh sách SSR | P1 |
| 3 | Khách có thanh Đọc tiếp, đồng bộ vào tài khoản khi đăng nhập, không đổi schema | P1 |

## Phases

| # | Phase | Brief | Status |
|---|-------|-------|--------|
| 1 | [Font và token màu](./phase-01-font-and-tokens.md) | mục 1, 7 | Done |
| 2 | [Header và footer](./phase-02-header-and-footer.md) | mục 6 | Done |
| 3 | [Hero trang chủ và thanh Đọc tiếp của thành viên](./phase-03-home-hero-and-member-continue-bar.md) | mục 2 | Done |
| 4 | [Bốn ô thể loại](./phase-04-home-genre-tiles.md) | mục 4 | Done |
| 5 | [Kệ truyện, xếp hạng, khối mời viết](./phase-05-home-shelves-rankings-and-write-band.md) | mục 5 | Done |
| 6 | [Trang truyện](./phase-06-story-page.md) | mục 3 | Pending |
| 7 | [Cập nhật docs](./phase-07-update-docs.md) | mục 9 | Pending |
| 8 | [Báo cáo so ảnh 1440px/390px sáng tối](./phase-08-visual-comparison-report.md) | "Xong khi" | Pending |
| 9 | [Thanh Đọc tiếp cho khách](./phase-09-guest-continue-reading-bar.md) (phase cuối) | mục 8 | Pending |

Thứ tự tuần tự. Phụ thuộc chính: 3 cần 1; 4 và 6 dùng `CoverBackdrop` của 3; 6 dùng `StoryShelfCard` của 5; 9 dùng thanh của 3 và nối thêm vào báo cáo của 8. Phase 9 đứng cuối theo yêu cầu, nên phase 7 và 8 làm trước nó, và phase 9 tự bổ sung docs và ảnh của mình.

## Quyết định diễn giải (brief không nói rõ, đã chọn để không hỏi lại)

| Điểm | Chọn | Vì sao |
|------|------|--------|
| Board không có "Truyện nổi bật" (mod) và "Truyện mới cần độc giả" | Giữ cả hai, dựng lại bằng kệ của board, ẩn khi rỗng | Là tính năng đã có checkbox trong spec, mod vẫn vận hành; brief không nói bỏ |
| Board không có dải "Truyện mới đáng chú ý" | Bỏ dải; hero vẫn mang nhãn và lấy từ danh sách này | Đúng board, tính năng còn ở hero |
| Hàng số liệu trang truyện: board có "đánh giá" | Giữ "ra chương" như spec mục 8 | Brief không đổi điểm này; CLAUDE.md quy định spec thắng khi mâu thuẫn |
| Header khách dưới 768px | Giữ nút tròn mở menu Đăng nhập/Đăng ký | Trang truyện không có thanh tab; bỏ thì khách hết lối đăng nhập |
| Khóa cài đặt font đọc `plus-jakarta-sans` | Giữ khóa, chỉ đổi nhãn sang "Be Vietnam Pro" | Không phải đổi `users.preferences`; brief chỉ cho đổi nhãn |
| Đồng bộ tiến độ khách vào tài khoản | Chỉ ghi khi tài khoản chưa có hàng cho truyện, hoặc chương local lớn hơn | Mỗi (user, story) chỉ có một hàng; không được làm mất tiến độ thật |

Các dòng trên do plan chọn, không phải brief chốt. Phase 8 liệt kê chúng ở đầu báo cáo để user xác nhận.

## Success Criteria

- [ ] Mọi phase có Status completed
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e` xanh ở commit cuối
- [ ] Có báo cáo trong `plans/reports/` so ảnh 1440px và 390px, sáng và tối, với design
- [ ] `docs/project-spec.md` mục 2, 5, 8 và `docs/design-guidelines.md` khớp code

## Unresolved

Không có mâu thuẫn thật sự với spec về 18+, cache, hay nhu cầu đổi schema.

## Red Team Review

### Session — 2026-11-09

4 reviewer (Security Adversary, Failure Mode Analyst, Assumption Destroyer, Scope & Complexity Critic). 37 phát hiện gốc, gộp còn 15 mục. User yêu cầu không hỏi lại, nên phân xử theo bằng chứng code và brief.

**Findings:** 15 (13 accepted, 2 rejected). **Severity breakdown:** 1 Critical, 10 High, 4 Medium.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Đồng bộ theo `updatedAt` có thể xóa vĩnh viễn tiến độ thật; `GET` lỗi vẫn `PUT`; `progress: null` chưa xử lý | Critical | Accept: so số chương, nhánh lỗi rõ ràng | Phase 9 |
| 2 | `/me` 401 xóa `data-continue-rows`, placeholder của khách biến mất; khối boot đứng sau `return` sớm | High | Accept: `data-guest-continue` riêng, đặt trước reader settings | Phase 9 |
| 3 | Mount đồng bộ ở root gây hydration mismatch | High | Accept: dùng cổng `accountLoaded` | Phase 9 |
| 4 | Store thiếu subscribe, snapshot cache, trạng thái lỗi | High | Accept | Phase 9 |
| 5 | Truyện đã thành 18+ vẫn đồng bộ vào lịch sử | High | Accept: kiểm card trước khi ghi | Phase 9 |
| 6 | Route `/api/v1`, đổi `resumeChapter`, Web Locks, hook trùng là thừa | High | Accept: server function, `findReadableChapterRef`, bỏ khóa, tách `useScrollCheckpoint` | Phase 9 |
| 7 | Phase 2, 5, 1 bỏ sót e2e ghim hành vi cũ; tham chiếu dòng sai | High | Accept | Phase 1, 2, 5 |
| 8 | Dưới `md` khách mất ô tài khoản lúc tải; `/library` không chuyển hướng | High | Accept | Phase 2 |
| 9 | Phase 8 không có ảnh board; công thức chụp thiếu cuộn, worker, thành viên | High | Accept: `blocked` nếu không có ảnh board | Phase 8 |
| 10 | Phase 6 thiếu số mobile; `compact` nằm sai phase | High | Accept | Phase 5, 6 |
| 11 | Hero chọn hai nơi, tải thừa `notable` và `recent` | Medium | Accept: `HomeHero`, `limit: 1`, `HOME_RECENT_LIMIT` | Phase 3, 5 |
| 12 | Trùng lặp nhỏ: `--genre-*`, `AccentHeading`, control theme, prop mồ côi, ngưỡng ô thể loại | Medium | Accept | Phase 2, 4, 5, 7 |
| 13 | Thanh và thẻ đè hero thiếu stacking; `body` 400 đổi trang đọc; docs còn quy tắc cũ; e2e 18+ theo tên không bắt được bìa | Medium | Accept | Phase 1, 3, 4, 6, 7 |
| 14 | Bỏ "đánh giá" là mâu thuẫn cache phải dừng hỏi | High | Reject một phần: đây là board lệch spec mục 8, không phải vi phạm cache (`docs/project-spec.md` mục 6 không cấm số công khai); bỏ lý do cache, ghi "chờ user xác nhận" ở phase 8 | plan.md, Phase 6, 8 |
| 15 | Đồng bộ đặt `updated_at = now()` đưa truyện cũ lên đầu; thiếu rate limit cho read công khai | Medium | Reject: một lần duy nhất, không mất dữ liệu; sửa cần đổi route ghi. Read theo khóa unique, có tiền lệ `/top-readers`. Đã ghi vào Risk | Phase 9 |

### Whole-Plan Consistency Sweep

Ghi cùng kết quả validate ở `## Validation Log`.

## Validation Log

### Session 1 — 2026-11-09

**Trigger:** chế độ `--deep`, user yêu cầu tự validate sau khi tạo plan.
**Questions asked:** 8. User cấm hỏi lại, nên không có phỏng vấn; mọi câu dưới đây được trả lời bằng brief, không phải do user trả lời trực tiếp.

#### Verification Results

- **Tier:** Full (9 phase; Fact Checker, Flow Tracer, Scope Auditor, Contract Verifier chạy qua 4 reviewer red-team)
- **Claims checked:** 110 (87 đường dẫn trong phase file, 23 symbol), sau khi áp red-team
- **Verified:** 110 | **Failed:** 0 | **Unverified:** 0
- Bản nháp đầu có 4 khẳng định sai do red-team phát hiện, đều đã sửa: `/library` chuyển hướng khách; `Math.min` chặn đồng hồ lệch; hint `data-continue-rows` giữ chỗ được cho khách; đồng bộ an toàn chỉ nhờ kiểm chương đọc được.
- Hành vi chưa đo được ở bước lập plan, dời sang phase 8: LCP, viền blur và Safari iOS.

#### Questions & Answers

1. **[Architecture]** Dữ liệu ô thể loại lấy từ đâu và tránh N+1 thế nào?
   - Options: Core service một truy vấn window (Recommended) | Truy vấn theo từng thể loại | Tính ở route
   - **Answer:** Core service một truy vấn (brief mục 4).
   - **Rationale:** Brief cấm truy vấn DB từ route và N+1.
2. **[Assumptions]** Bìa truyện 18+ có được dùng làm nền ô thể loại không?
   - Options: Không bao giờ trong HTML (Recommended) | Có nếu làm mờ
   - **Answer:** Không bao giờ (brief mục 4, spec mục 7).
   - **Rationale:** HTML cache công khai; int test và e2e kiểm theo URL bìa.
3. **[Scope]** Thứ tự docs, báo cáo và thanh Đọc tiếp cho khách?
   - Options: Thanh khách là phase cuối, docs và báo cáo trước (Recommended) | Thanh khách trước docs và báo cáo
   - **Answer:** Thanh khách là phase cuối (brief mục 8 và yêu cầu lập plan).
   - **Rationale:** Phase 9 tự bổ sung docs và ảnh của mình để báo cáo không thiếu.
4. **[Tradeoffs]** Font khai báo thế nào để sau đổi được?
   - Options: Chỉ qua `--font-ui` (Recommended) | Ghi tên font ở từng nơi
   - **Answer:** Chỉ qua `--font-ui` (brief mục 1).
   - **Rationale:** Font mới chỉ được user tạm chấp nhận.
5. **[Risks]** Thanh Đọc tiếp cho khách có cần đổi schema không?
   - Options: Không, dùng localStorage và `reading_progress` có sẵn (Recommended) | Thêm cột hoặc bảng
   - **Answer:** Không đổi schema (brief mục 8 và "Không làm").
   - **Rationale:** Cần đổi thì phải dừng hỏi user; luồng hiện tại không cần.
6. **[Scope]** Cuộc thi trên trang chủ?
   - Options: Giữ `CONTESTS_ENABLED` false (Recommended) | Bật lại
   - **Answer:** Giữ false ("Không làm" của brief).
   - **Rationale:** Nhánh cuộc thi trong khối mời viết để nguyên.
7. **[Assumptions]** Board khác danh sách quyết định thì theo bên nào?
   - Options: Theo danh sách (Recommended) | Theo board
   - **Answer:** Theo danh sách (mục "Nguồn design" của brief).
   - **Rationale:** Áp dụng cho nền ô thể loại và bỏ 3 board HeroCover, HeroPlain, HeroPaper.
8. **[Risks]** Không lấy được ảnh board thì phase báo cáo xử lý thế nào?
   - Options: Đặt `blocked` và hỏi user (Recommended) | So theo số liệu rồi đánh xong
   - **Answer:** `blocked` và hỏi user (suy từ "Xong khi" của brief: phải so ảnh với design).
   - **Rationale:** So số liệu không đạt điều kiện hoàn thành.

#### Confirmed Decisions

- Mọi quyết định 1-9 của brief đã vào phase tương ứng; không có câu hỏi về 18+, cache hay schema còn mở.
- Các điểm brief không nói rõ nằm ở bảng "Quyết định diễn giải", chờ user xác nhận khi đọc báo cáo phase 8.

#### Action Items

- [ ] Khi tới phase 8, lấy ảnh board trước khi chụp app

#### Impact on Phases

- Không phát sinh thay đổi mới so với bản sau red-team.

### Whole-Plan Consistency Sweep

- Files reread: plan.md, phase-01 đến phase-09 (quét toàn văn bằng grep sau khi sửa)
- Decision deltas checked: 14 (`AccentHeading`, `--genre-*`, `heroDetail`, `getHomeHeroDetail`, `FooterThemeSwitch`, Web Locks, `Math.min`, route `guest-continue`, `resumeChapter`, `story_shelf_chapter`, `home_invite_title_accent`, `pickHero`, 10 truyện lưu local, "đã được duyệt")
- Reconciled stale references: 1 (dòng trùng ở bảng file phase 3); các lần xuất hiện còn lại chỉ nằm trong nhật ký review hoặc là chỉ dẫn xóa có chủ đích
- Unresolved contradictions: 0

<!-- slug: redesign-design-chot -->
