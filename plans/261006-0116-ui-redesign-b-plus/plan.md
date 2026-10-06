---
title: Redesign UI hướng B+
description: >-
  Đổi giao diện toàn site sang hướng B+ (ứng dụng đọc ấm): tokens, 2 font mới,
  component, layout có thanh tab mobile, trang chủ, trang truyện, trang đọc,
  /write, editor, trang phụ và tài liệu; không đổi API/DB/URL.
status: in-progress
priority: P1
effort: 8d
branch: overnight/261006
tags:
  - frontend
  - ui
  - design-system
  - a11y
  - i18n
  - e2e
blockedBy: []
blocks: []
created: '2026-10-05T18:16:43.403Z'
createdBy: 'ck:plan'
source: skill
---

# Redesign UI hướng B+

## Overview

Plan riêng do user thêm (không ứng với checkbox nào ở mục 5 spec), chạy **trước Giai đoạn 2**. Nguồn chuẩn yêu cầu: `plans/reports/brainstorm-261006-ui-redesign-b-plus-final-report.md` (+ `plans/reports/design-261006-write-editor-screens-report.md` cho phase 8–10). Không cần mở canvas. Phụ thuộc tuyến tính 1 → 12; mỗi lần `/ck:cook` đúng một phase. Gate mỗi phase (e2e cổng 3100, không chạy hai gate song song):

`pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm test:int && pnpm test:e2e`

Đổi `packages/shared/messages/vi.json` thì chạy `pnpm i18n:compile` trước gate.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Tokens và font](./phase-01-tokens-va-font.md) | Completed |
| 2 | [Component dùng chung](./phase-02-component-dung-chung.md) | Completed |
| 3 | [Layout header footer thanh tab](./phase-03-layout-header-footer-thanh-tab.md) | Completed |
| 4 | [Trang chủ](./phase-04-trang-chu.md) | Completed |
| 5 | [Trang truyện](./phase-05-trang-truyen.md) | Completed |
| 6 | [Trang đọc: khung](./phase-06-trang-doc-khung.md) | Completed |
| 7 | [Trang đọc: sheet cài đặt và mục lục](./phase-07-trang-doc-sheet.md) | Completed |
| 8 | [Trang write](./phase-08-trang-write.md) | Completed |
| 9 | [Editor chương: tách file](./phase-09-editor-tach-file.md) | Completed |
| 10 | [Editor chương: giao diện](./phase-10-editor-giao-dien.md) | Pending |
| 11 | [Trang phụ](./phase-11-trang-phu.md) | Pending |
| 12 | [Tài liệu và spec](./phase-12-tai-lieu-va-spec.md) | Pending |

## Dependencies

- Không blockedBy. Plan `261004-1654-giai-doan-1-doc-va-viet` còn phase 2 (thử S3 thật) và 17 (VPS + R2) chờ hạ tầng: không sửa file nào trùng plan này, không chặn.
- Plan Giai đoạn 2 (chưa tạo) đi **sau** plan này.

## Quyết định đã chốt

**User (memory `ui-redesign-before-stage-2`, brainstorm cuối):** hướng B+ "ứng dụng đọc ấm"; Plus Jakarta Sans (giao diện) + Source Serif 4 (nội dung), 2 package `@fontsource-variable/*` mới là dependency duy nhất được thêm, bỏ `@fontsource/be-vietnam-pro` và `@fontsource-variable/inter`; dark theo OS, không nút chuyển; lớp trang trí giữ (gáy sách, hero trang chủ (canvas ghi "Biên tập chọn"; nhãn UI tạm "Mới đáng chú ý" tới khi có `featured_slots`, xem [auto] hero, red team #10), meta giàu, chip thể loại, icon tiêu đề mục, dải `--band`, hero màu tag ở trang truyện, hàng số liệu có vạch ngăn), bỏ (nền chấm bi, hoạ tiết bìa theo thể loại); được sửa spec §2 và §8.

**Controller (đêm 2026-10-06, sáng cần user duyệt):**

- [auto] Scope HOLD, không mở rộng/cắt ngoài các mục dưới. Lý do: brainstorm đã cắt YAGNI kỹ.
- [auto] Nhấn theo preset đọc dùng `--reader-primary`, `--reader-primary-foreground`, `--reader-primary-soft`, chỉ áp trong `.reader-page`; không ghi đè `--primary` trong `[data-reader-theme]`. Lý do: thuộc tính nằm trên `<html>` ở mọi trang, `#4FC2A8` trên `#F5F4EF` ~2:1.
- [auto] Map font cũ `be-vietnam-pro`, `inter` → `plus-jakarta-sans` ở Zod (`z.preprocess`), boot script, `reader.css`; sửa fixture `me.int.test.ts:94`, `boot-script.test.ts`, `settings.test.ts`. Lý do: thiếu một nơi là nháy chữ hoặc mất cả khối cài đặt đồng bộ.
- [auto] Import `wght.css` cả 2 font + `source-serif-4/wght-italic.css`; preload đúng 4 file `*-{latin,vietnamese}-wght-normal.woff2`; không expose opsz. Lý do: khớp file preload, `<em>` trong chương cần italic.
- [auto] Focus ring `ring-ring/70` → `ring-ring` (giữ `ring-[3px]`). Lý do: bỏ nghi ngờ tương phản do trộn alpha; background/ring, card/ring ≥ 5.8.
<!-- Updated: Red Team 2026-10-06 - thay quyết định phase 2 quét font-serif -->
- [auto] Tiêu đề UI `font-serif` → sans 800 và badge trạng thái → `status-badges.tsx`: mỗi phase trang (4, 5, 6, 8, 10, 11) tự đổi trong file nó sửa, phase 11 quét nốt; phase 2 chỉ đổi component dùng chung (bảng phân công trong phase 2). Serif chỉ còn ở nội dung truyện. Lý do (red team #3): phase 2 quét ~40 file bị phase sau viết lại, vướng 4 file > 200 dòng, tiêu chí `rg font-serif` = 6 không đạt được vì `app.css`; không test nào kiểm font tiêu đề.
- [auto] Ẩn thanh tab mobile bằng prop `SiteLayout`, prop `bottomInset: 'tabBar' | 'cta' | 'none'` định nghĩa ngay phase 3, trang truyện truyền `'cta'` từ phase 3 để khung (không phải `main`) chừa đáy cho CTA dính, footer không bị che. Lý do: 404 chương cũng dùng site layout; chấp nhận khoảng trống CTA tới phase 5; red team #14.
- [auto] Tách `site-layout.tsx` (207 dòng) ở phase 3. Lý do: quy tắc ≤ 200 dòng.
- [auto] Sheet cài đặt: giữ `modal` mặc định Radix, overlay trong suốt, một instance, responsive bằng class CSS. Lý do: research Q1 sai (`modal={false}` không trap focus/khoá cuộn); route đọc SSR nên không matchMedia.
- [auto] Phần tử trùng theo viewport ẩn bằng `display:none` (`hidden md:flex` ở header/trang truyện; `hidden lg:flex`/`lg:hidden` ở trang đọc: một mốc `lg` cho rail, thanh dưới, panel, red team #12). Lý do: Playwright strict mode.
<!-- Updated: Red Team 2026-10-06 - hero Mới đáng chú ý -->
- [auto] Hero trang chủ nhãn "Mới đáng chú ý" (không "Biên tập chọn"), truyện = truyện đầu trong `notable` SSR có `chapterCount > 0`, không có thì không render hero; không giới thiệu, nút "Xem truyện" thay "Đọc chương 1", lọc hero theo `publicId`. Lý do: chưa có `featured_slots`, không ai chọn tay; `listNotable` lấp chỗ không lọc số chương (`packages/core/src/catalog/home.ts:70-75`); chương 1 có thể đã xoá mềm (red team #10).
<!-- Updated: Red Team 2026-10-06 - Đọc tiếp chỉ Chương X -->
- [auto] "Đọc tiếp" trang chủ chỉ ghi "Chương X" (+ " · tên chương" từ `HistoryItemDto.chapterTitle`, `packages/core/src/reading/history.ts:16`), không mẫu số, không số chương còn lại, không thanh tiến độ; lọc 18+ theo `me.preferences.showMature` ở client, có e2e. Lý do: số chương có khoảng trống (xoá mềm/nháp) → "Chương 9 / 7", nhất quán với `/library`; API lịch sử trả cả 18+ (red team #4, #15).
- [auto] Thời gian trong HTML cache dùng `formatDate()`. Lý do: quy ước `lib/format.ts`.
- [auto] Không nút "Xem tất cả" khi không có đích. Lý do: YAGNI, search không có sort.
- [auto] Trang truyện: mục lục không cột ngày, render đủ; thẻ tác giả chỉ tên + @username + chữ cái đầu. Lý do: thiếu dữ liệu, không đổi DTO.
- [auto] Trang đọc: pill "Chương N" ngoài h1, giữ "Báo cáo" cuối chương, avatar lời nhắn là chữ cái đầu; giữ ngắt cảnh `* * *` (cả editor); tách `reader-settings-sheet.tsx` ở phase 7. Lý do: e2e `reader.spec.ts:27`, `moderation.spec`; đổi ngắt cảnh nội dung đã đăng nằm ngoài Scope HOLD (red team #15).
- [auto] `/write` rỗng chỉ hiện khối rỗng + CTA; 3 số liệu cộng inline trong `WriterStats` (không file/test riêng, red team #13). Lý do: 2 link "Tạo truyện mới" vỡ `stories.spec.ts:7`.
- [auto] Editor: phase 9 chỉ di chuyển code của `chapter-editor.tsx` (553) ra file nhỏ (state/ref giữ trong `ChapterEditor`, hook nhận setter thô/ref), phase 10 đổi giao diện; số chữ/trạng thái lưu/badge render một lần, đổi vị trí bằng JS media query; tên truyện qua `useMyStory`; badge dùng `components/status-badges.tsx` (phase 2); xem trước revision chỉ nhận HTML từ `useRevisionPreview`. Lý do: `getByText` không bỏ node ẩn; route `ssr:false`; red team #1, #15.
- [auto] `/search` giữ Select lọc, không chip. Lý do: `search.spec.ts:76-78`.
- [auto] `/library` không thêm thanh tiến độ. Lý do: xấp xỉ do số chương có khoảng trống; YAGNI.
- [auto] Trang phụ chỉ áp token + component + khung trang; phase 11 tách cố định 4 file: `routes/settings.tsx` (207), `routes/moderation.tsx` (203), `components/moderation/report-card.tsx` (335), `components/story-form.tsx` (202) theo scout-03; tab dạng link restyle tại chỗ, không `SegmentedLinks`. Lý do: KISS; điều kiện tách cũ tự mâu thuẫn ≤ 200; `Link` typed search params (red team #13, #15).
- [auto] Phase 12: sửa spec §2 (hàng Font), §8, dòng `project-spec.md:280`; viết lại `docs/design-guidelines.md`; thêm bước "Purge Everything sau deploy/rollback đổi asset" vào `docs/deployment-cloudflare.md`; không đánh `[x]` checkbox nào. Lý do: plan không ứng checkbox; HTML cache 24h trỏ asset cũ (red team #15).
- [auto] e2e mobile mới dùng `test.use({ viewport: { width: 360, height: 800 } })`, không đổi config Playwright. Lý do: config chỉ có Desktop Chrome.

## Ngoài phạm vi

- Không đổi API, schema DB, migration, route, URL, `head`/SEO; ngoại lệ duy nhất: enum font trong Zod + map giá trị cũ.
- Không làm tính năng Giai đoạn 2 canvas có vẽ: xếp hạng, theo dõi, chuông, bình luận, đánh giá, `featured_slots`, dashboard tác giả đầy đủ.
- Không làm: khu "Đã hoàn thành", carousel hero, đảo thứ tự/"Đến chương…" ở mục lục, "Xem thêm N chương", chia sẻ, header trong suốt, ô tìm kiếm full-width mobile, chip lọc `/search`, thanh tiến độ `/library`, cột ngày mục lục, bio/"Cùng tác giả", nút chuyển sáng/tối, gradient, thụt đầu dòng, thanh tiến trình chuyển trang.
- Không thiết kế lại bố cục trang phụ; không thêm dependency ngoài 2 font; không đổi config Docker/env/CI/Cloudflare/Playwright.

## Red Team Review

### Session — 2026-10-06 (tự động, controller phân xử `[auto]`)
**Findings:** 34 (33 accepted, 1 rejected), gộp thành 15 dòng dưới. **Severity:** 1 Critical, 12 High, 21 Medium.
Report: `reports/from-code-reviewer-to-planner-red-team-{security-adversary,failure-mode-analyst,assumption-destroyer,scope-complexity-critic}-plan-review-report.md`.

| # | Finding (gộp) | Severity | Disposition | Applied To |
|---|---------------|----------|-------------|------------|
| 1 | Editor quá lớn cho một phiên; tách hook lệch chỗ sở hữu state (callback vào deps autosave → xung đột giả) | Critical | Accept: tách thành phase 9 (chỉ di chuyển code, state giữ trong `ChapterEditor`, hook nhận setter thô) và phase 10 (giao diện) | 9, 10 |
| 2 | Trang đọc quá rộng cho một phiên | High | Accept: phase 6 khung (thanh trên/dưới, rail, đầu/cuối chương), phase 7 hai sheet | 6, 7 |
| 3 | Phase 2 quét `font-serif`/badge ~40 file, bị làm lại ở phase sau, mâu thuẫn ≤ 200 dòng; tiêu chí `rg font-serif` = 6 không thể đạt (`app.css`) | High | Accept: phase 2 chỉ component dùng chung; mỗi phase trang tự bỏ `font-serif` + đổi badge trong file của mình; phase 11 quét phần còn lại; tiêu chí grep loại `app.css` | 2, 4–11 |
| 4 | "Đọc tiếp" trang chủ ra số sai ("Chương 9 / 7") vì số chương có khoảng trống | High | Accept: chỉ hiện "Chương X" (+ tên chương nếu API lịch sử có sẵn), không mẫu số, không "Còn N", không thanh tiến độ | 4 |
| 5 | Header mobile cho khách ~388px > 360px | High | Accept: < `sm` chỉ ô logo, chữ "Novel Hub" `sr-only`; pill "Tủ truyện"/"Viết truyện" desktop chỉ khi đăng nhập như hiện tại | 3 |
| 6 | Link bìa thứ hai trên thẻ trùng tên truyện → vỡ strict locator `search.spec` | High | Accept: mỗi thẻ đúng một `<a>` | 2, 4, 11 |
| 7 | `--reader-card`/`--reader-primary*` thiếu khi không chọn preset (mọi khách, mọi e2e) | High | Accept: khai báo cho mặc định theo OS (light = ngà, dark = xám tối) + test tương phản cho mặc định | 1 |
| 8 | Màn 18+: lớp ngoài phải đục toàn màn, giữ `inert`, sheet không mở được khi đang chặn; ring trên màn 18+ rớt 2.18:1 | High | Accept: giữ `mature-gate` `fixed inset-0` nền đục, sheet trigger nằm trong vùng inert, màn 18+ dùng ring của site; e2e kiểm | 5, 6, 7 |
| 9 | Nút font trong panel hiển thị bằng chính font → tải Literata/Noto khi mở panel, trái spec §8 | High | Accept: nhãn font hiển thị bằng font giao diện | 7 |
| 10 | Hero "Biên tập chọn" không ai chọn; có thể là truyện 0 chương | High | Accept (sửa): nhãn hero là "Mới đáng chú ý" tới khi có `featured_slots`; lấy truyện đầu có `chapterCount > 0`, không có thì không render hero | 4 |
| 11 | Nút trên hero màu tag chưa định nghĩa; `LibraryButton` 4 nhánh outline chữ tối; "Tuỳ chọn cho {tên}" không thuộc trang truyện | Medium | Accept: kiểu "trên màu bìa" cho mọi nhánh `LibraryButton` và nút đọc; bỏ tên đó khỏi danh sách trang truyện | 5 |
| 12 | Breakpoint rail (`md`) lệch panel phải (`lg`); class sheet thiếu `lg:right-0` | Medium | Accept: một breakpoint `lg` cho rail + panel phải; < `lg` thanh dưới + bottom sheet | 2, 6, 7 |
| 13 | Tab bar dùng `<a>` (reload app); e2e không thể fail; helper 1 dòng, props không caller; `SegmentedLinks` không khớp `Link` typed | Medium | Accept: `Link` TanStack; bỏ e2e "không tab bar" ở reader/editor; inline helper, bỏ props thừa; không `SegmentedLinks`, giữ `Link` typed + class dùng chung | 2, 3, 4, 8, 11 |
| 14 | CTA dính đáy che footer; `library.spec` chạy 390×600 nên kiểm CTA dính chứ không phải nút hero | Medium | Accept | 5 |
| 15 | Lặt vặt: tiêu chí grep `be-vietnam-pro` mâu thuẫn fixture; key `section_see_all` không tồn tại; đổi ngắt cảnh trang đọc ngoài phạm vi; xem trước revision chỉ nhận HTML server; 18+ trong "Đọc tiếp" cần e2e; thang chữ body chưa dựng; điều kiện tách file phase trang phụ tự mâu thuẫn; purge CDN sau deploy đổi asset | Medium | Accept: sửa tiêu chí (loại file test), bỏ đổi ngắt cảnh, thêm e2e, phase 1 đặt body 15/500, phase 11 tách cố định danh sách file, phase 12 ghi bước purge vào tài liệu deploy | 1, 4, 6, 10, 11, 12 |
| — | Bỏ map font cũ (chưa public) | Medium | **Reject**: map rẻ; thiếu map thì `.catch(undefined)` bỏ cả khối cài đặt đồng bộ. Người đã lưu `literata` giữ Literata (tải khi dùng) `[auto]` chấp nhận, chưa public | — |

Phase docs tách ra phase 12 (phase 11 chỉ còn trang phụ) để phase 11 đủ gọn khi phải tách 4 file > 200 dòng.

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01` … `phase-12` (13 file); đối chiếu 4 report red team + `reports/scout-03-write-editor-aux-docs-report.md`; grep lại code cho mọi `path:line` mới (`chapter-editor.tsx`, `library-button.tsx`, `revision-history-sheet.tsx`, `history.ts:16`, `vi.json`, `cache-headers.ts`, `docs/project-spec.md` §8, `docs/deployment-cloudflare.md`).
- Decision deltas checked: 16 (15 Accept + 1 Reject).
- Reconciled stale references: 30 nhóm, gồm: Overview "1 → 9" → "1 → 12" và "phase 7–8" → "8–10"; 10 dòng `[auto]` (font-serif phase 2, tab bar/`bottomInset`, `display:none` md→lg khu đọc, hero, "Còn N chương", trang đọc/ngắt cảnh, `/write` cộng số liệu, editor, trang phụ tách 4 file, docs → phase 12); dòng user "hero Biên tập chọn" chú thích nhãn tạm; frontmatter + tiêu đề + `dependencies` của phase 8, 9, 11 (số cũ 7, 8, 9); Dependency map + "Ngoài phạm vi" ở mọi phase (P6→P7 sheet, P7→P8 /write, P8→P9/P10 editor, P9→P11/P12); "tách ở phase 6" → 7 (phase 1); "docs (phase 9)" → 12; `section_see_all`; tiêu chí `rg font-serif` = 6; "link bìa"; `StoryGrid layout`; `SegmentedLinks` (phase 11, `design-guidelines`); `meTabHref`, `remainingChapters`/`readRatio`, `home_continue_position/remaining`, `ResumeLink.variant`, `TagChip.current`, `SectionHeading.action`, `write-summary`; "Tuỳ chọn cho {tên}"; `library.spec` "(1280)" → 390×600; e2e "inert do e2e 18+ che" (không có) → e2e Tab phase 6; `hr` vạch ngắn ở trang đọc và editor ("như reader.css phase 6") → giữ `* * *`; `modal={false}` dòng 61 → 63; `md:` rail/panel → `lg`.
- Unresolved contradictions: 0. Ghi chú cần user duyệt sáng (không phải mâu thuẫn): (1) nhãn hero "Mới đáng chú ý" thay "Biên tập chọn" mà user đã nêu trong lớp trang trí giữ (#10, controller Accept); (2) `pickHero` giữ hàm + test dù #13 nói inline helper, vì #10 thêm điều kiện lọc; (3) bước purge ghi vào `docs/deployment-cloudflare.md` vì repo không có `docs/deployment-guide.md`; (4) effort tăng 7.5d → 8d do tách 3 phase.


## Validation Log

### Session 1 — 2026-10-06 (tự động qua đêm, mọi câu `[auto]` chọn Recommended)
**Trigger:** `/ck:plan --deep` bước validate sau red team.
**Questions asked:** 7 (tự trả lời, không hỏi user)

### Verification Results
- Claims checked: bỏ qua theo guard (red team đã xác minh bằng `path:line` ở 4 report); chỉ quét `[UNVERIFIED]`.
- Verified: — | Failed: 0 | Unverified: 0
- Tier: Full (12 phase), dựa trên bằng chứng red team.

#### Questions & Answers

1. **[Scope]** Hero trang chủ: user đã chốt giữ hero "Biên tập chọn", nhưng chưa có ai chọn (nguồn là truyện mới đáng chú ý). Nhãn hiển thị thế nào tới khi có `featured_slots`?
   - Options: Giữ hero, nhãn "Mới đáng chú ý" (Recommended) | Giữ nhãn "Biên tập chọn" | Ẩn hero tới Giai đoạn 2
   - **Answer:** [auto] Giữ hero, nhãn "Mới đáng chú ý"
   - **Rationale:** Giữ thành phần trang trí user chốt, chỉ đổi nhãn để không ghi sai sự thật; **chạm quyết định user → sáng cần duyệt**.
2. **[Assumptions]** Người đọc đã lưu `font: 'literata'` (mặc định cũ) sẽ giữ Literata thay vì chuyển sang Source Serif 4. Có migrate một lần không?
   - Options: Chấp nhận, không migrate (Recommended) | Thêm cờ phiên bản schema + migrate một lần
   - **Answer:** [auto] Chấp nhận
   - **Rationale:** Chưa public, chỉ dữ liệu staging; Literata vẫn tải khi dùng.
3. **[Tradeoffs]** Nút chọn font trong panel cài đặt: hiển thị bằng font giao diện hay bằng chính font đó?
   - Options: Font giao diện, không tải font tuỳ chọn (Recommended) | Chính font đó, sửa spec §8
   - **Answer:** [auto] Font giao diện
   - **Rationale:** Spec §8 "font khác mặc định chỉ tải khi người đọc chọn" là nguồn chuẩn.
4. **[Scope]** Plan tăng từ 9 lên 12 phase sau red team (tách trang đọc, editor, tài liệu). Giữ?
   - Options: Giữ 12 phase (Recommended) | Gộp lại 9 phase
   - **Answer:** [auto] Giữ 12
   - **Rationale:** Mỗi phase phải gate xanh trong một phiên worker; gate đỏ sau một lần sửa là dừng cả đêm.
5. **[Risks]** Playwright chỉ có project Desktop Chrome; bố cục mobile chỉ được e2e ở spec mới 360px (thanh tab, tràn ngang, CTA). Thêm project mobile vào config?
   - Options: Không, dùng `test.use({ viewport })` trong spec mới (Recommended) | Thêm project mobile vào `playwright.config`
   - **Answer:** [auto] Không đổi config
   - **Rationale:** Không đổi config khi chưa được duyệt (CLAUDE.md); viewport trong spec đủ cho luồng chính.
6. **[Architecture]** Header editor cần tên truyện, chỉ có qua `useMyStory(publicId)` (thêm 1 request khi mở editor trực tiếp). Chấp nhận?
   - Options: Chấp nhận `useMyStory` (Recommended) | Bỏ tên truyện khỏi header
   - **Answer:** [auto] Chấp nhận
   - **Rationale:** Hook có sẵn, không API mới; thường đã có trong cache Query khi đi từ trang quản lý.
7. **[Scope]** Bước purge toàn bộ Cloudflare sau deploy đổi asset ghi ở đâu?
   - Options: `docs/deployment-cloudflare.md` (Recommended, file đang có) | Tạo `docs/deployment-guide.md`
   - **Answer:** [auto] `docs/deployment-cloudflare.md`
   - **Rationale:** Không tạo file tài liệu mới khi đã có chỗ.

#### Confirmed Decisions
- Hero: nhãn "Mới đáng chú ý" — `[auto]`, chờ user duyệt vì chạm quyết định "Biên tập chọn".
- Font cũ `literata` đã lưu: giữ nguyên — chưa public.
- Nút font: font giao diện — spec §8.
- 12 phase, mỗi phase một worker + gate.
- e2e mobile qua `test.use({ viewport })`, không đổi config.
- Editor header dùng `useMyStory`.
- Purge CDN ghi ở `docs/deployment-cloudflare.md`.

#### Action Items
- [x] Định nghĩa `bottomInset` ngay phase 3 (bỏ đổi tên prop ở phase 5) — đã sửa phase 3, 5, plan.md.

#### Impact on Phases
- Phase 3, 5: prop `SiteLayout` `bottomInset` có từ phase 3.
- Các câu 1–7 khớp nội dung phase hiện có (đã áp ở red team), không cần sửa thêm.

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01 … phase-12 (grep thuật ngữ cũ toàn plan)
- Decision deltas checked: 8
- Reconciled stale references: 10 (prop `tabBar` → `bottomInset` ở phase 3, 5, plan.md)
- Unresolved contradictions: 0

### Session 2 — 2026-10-06 (tự động qua đêm, mọi câu `[auto]` chọn Recommended)
**Trigger:** `/ck:plan validate` (hàng đợi Q4 overnight). Session 1 bỏ qua fact-check theo guard; phiên này fact-check độc lập toàn plan với code hiện tại (3 agent Explore, mỗi agent 4 phase).
**Questions asked:** 6 (tự trả lời, không hỏi user)

### Verification Results
- **Tier:** Full (12 phase), Fact Checker + Contract Verifier + cross-phase check.
- **Claims checked:** 242
- **Verified:** 218 | **Failed:** 15 | **Unverified:** 9
- Unverified (9): đều là file/token/key do phase trước trong plan tạo (`mobile-navigation.spec.ts` ← P3, `adaptive-right` ← P2, `--primary-soft`/`--band` ← P1, `status-badges.tsx` …), tên file font trong package chưa cài (P1 bước 1 `ls` kiểm), đếm "13 h1 lặp" (P11) — không chặn.

#### Failures (đã xử lý)
1. [Fact] P6: key mới `reader_back_to_story` trùng nghĩa key có sẵn `reader_toc_story` "Về trang truyện" (`vi.json:241`) → câu 2.
2. [Contract] P6: link "Chương trước" ở thanh dưới/rail và ở cuối chương cùng hiện → strict mode cho e2e mới → câu 1.
3. [Fact] P6/P12: spec §8 `project-spec.md:268` liệt kê "nút chương tiếp, lời nhắn tác giả, bình luận"; P6 đặt lời nhắn trước "Chương tiếp" (theo brainstorm), P12 không sửa dòng 268 → câu 3.
4. [Fact] P3: footer ghi cứng "© 2026"; code hiện tính năm động (`{year}` + `suppressHydrationWarning`) → câu 4.
5. [Fact] P10: "test `wordCountInRange`/`toLocalInputValue`/`saveStatusText` có từ trước" sai — chưa có unit test nào → câu 5.
6. [Fact] Lệch số dòng (10 chỗ) → câu 6: `home.ts:68-72` → 70-75 (P4, plan.md); `create-chapter.ts:30-35` → 29-36 (P4); `layout.spec.ts` font test 44 → 45 (P1, P7); `library.spec.ts:64-74` → `:64` + `:93-94` (P5); `reader-settings.spec.ts:146-148` → 141-144 (P7); `library.tsx:65-87` → 65-89 (P11); `TabItem` ở `moderation.tsx:99-104` nằm ngoài 107–142 → di chuyển 99–142 (P11, ảnh hưởng thật khi tách file); `ReportCard` cần import `Viewer` từ `report-actions.ts` (P11); `components/library/*` 370 → 360 (P11); mẫu badge cũ 4 → 2 nơi (P11); `design-guidelines.md` 103 → 104 (P12).
- **Rejected (1):** "P2 và P8 lệch variant `StoryVisibilityBadge`". Không lệch: P2 định nghĩa `default` = `bg-primary-soft text-primary` ("soft") và `destructive` = viền + chữ `--destructive` ("viền destructive"), đúng như P8 mô tả (verified by `phase-02` mục Badge).
- Ghi chú P7: `ThemeSwatches` gói lại từ callback `renderOption` (`reader-settings-sheet.tsx:81-93`), không phải di chuyển nguyên văn — đã ghi vào bước 1.

#### Questions & Answers

1. **[Risks]** Hai link tên "Chương trước" (ô điều hướng + link cuối chương) cùng hiện ở mọi viewport. Xử lý thế nào?
   - Options: Giữ cả hai tên, e2e mới luôn giới hạn locator trong nav "Điều hướng chương" hoặc `footer` (Recommended) | Đổi tên link cuối chương (vd. "Quay lại chương trước") | Bỏ link "Chương trước" ở cuối chương
   - **Answer:** [auto] Giữ tên, scope locator
   - **Rationale:** Cả hai đúng ngữ nghĩa; không e2e hiện có nào dùng tên này; đổi tên/bỏ link chạm thiết kế brainstorm.
2. **[Architecture]** Aria-label "Về trang truyện" ở thanh trên: thêm key `reader_back_to_story` hay dùng lại `reader_toc_story` (cùng chuỗi)?
   - Options: Dùng lại `reader_toc_story` (Recommended) | Thêm key mới
   - **Answer:** [auto] Dùng lại
   - **Rationale:** DRY, không key trùng nghĩa trong `vi.json`.
3. **[Scope]** Thứ tự cuối chương (lời nhắn → "Chương tiếp" → "Chương trước") khác cách liệt kê ở spec §8 dòng 268. Làm gì?
   - Options: Giữ thứ tự brainstorm, P12 sửa dòng 268 cho khớp (Recommended) | Đổi P6 theo thứ tự spec ("Chương tiếp" trước lời nhắn)
   - **Answer:** [auto] Giữ brainstorm, P12 sửa §8 dòng 268
   - **Rationale:** User đã cho phép redesign sửa §8; thứ tự này nằm trong brainstorm cuối đã chốt.
4. **[Assumptions]** Footer: ghi cứng "© 2026" hay giữ năm động như code hiện tại?
   - Options: Giữ năm động (Recommended) | Ghi cứng 2026
   - **Answer:** [auto] Giữ năm động
   - **Rationale:** Không lùi hành vi đang có; ghi cứng sẽ sai từ 2027.
5. **[Assumptions]** P10 nói đã có unit test cho `wordCountInRange`/`toLocalInputValue`; thực tế chưa có. Thêm test?
   - Options: Không thêm, sửa câu cho đúng; e2e `publish.spec` bao (Recommended) | Thêm unit test cho hai hàm
   - **Answer:** [auto] Không thêm
   - **Rationale:** YAGNI; phase không đổi logic hai hàm, chỉ đổi giao diện.
6. **[Assumptions]** Sửa 10 tham chiếu dòng lệch (mục Failures 6) trực tiếp trong phase file?
   - Options: Sửa ngay (Recommended) | Để nguyên, worker cook tự grep
   - **Answer:** [auto] Sửa ngay
   - **Rationale:** Worker cook context sạch, đọc plan theo nghĩa đen; `TabItem` ngoài khoảng dòng sẽ làm tách file thiếu type.

#### Confirmed Decisions
- "Chương trước" hai nơi: giữ tên, e2e scope locator — `[auto]`.
- Aria-label thanh trên: `reader_toc_story` — DRY.
- Cuối chương: lời nhắn → Chương tiếp → Chương trước; P12 sửa spec §8 dòng 268 — `[auto]`, sáng user duyệt cùng các sửa §8 khác.
- Footer năm động.
- Không thêm unit test cho hàm không đổi logic.
- Tham chiếu dòng đã cập nhật theo code hiện tại.

#### Action Items
- [x] P6: i18n dùng lại `reader_toc_story`; thêm dòng rủi ro trùng tên "Chương trước".
- [x] P12: thêm dòng 268 vào danh sách sửa §8 (Requirements + File inventory); `design-guidelines` 103 → 104.
- [x] P3: footer năm động.
- [x] P10: sửa câu về test có sẵn.
- [x] P1, P4, P5, P7, P11, plan.md: sửa số dòng; P11 `TabItem` 99–142 + import `Viewer`.

#### Impact on Phases
- Phase 1, 4, 5, 7, 11: chỉ số dòng/ghi chú di chuyển code.
- Phase 3: footer. Phase 6: key i18n + rủi ro locator. Phase 10: câu test. Phase 12: thêm dòng 268 của spec.
- Không đổi phạm vi, thứ tự phase, dependency, effort.

### Whole-Plan Consistency Sweep (Session 2)
- Files reread: plan.md, phase-01 … phase-12 (grep toàn plan).
- Decision deltas checked: 6 (+1 rejected).
- Reconciled stale references: 21 chỗ sửa ở 10 file; grep lại `reader_back_to_story`, `107–142`, `44-57`, `68-72`, `© 2026`, `146-148`, `4 nơi`, `30-35`, `65-87`, `64-74`, `370` → 0 kết quả.
- Unresolved contradictions: 0.
- Sáng cần user duyệt (cùng danh sách Session 1): `[auto]` câu 3 (sửa spec §8 dòng 268 theo thứ tự cuối chương của brainstorm).
