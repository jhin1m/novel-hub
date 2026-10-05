# Red team (Assumption Destroyer / Scope Auditor): plan redesign B+

Ngày 2026-10-06, chế độ tự động. Chỉ review plan, không sửa plan/code. Mọi bằng chứng đã grep/đọc trên code hiện tại.

Phạm vi: `plan.md`, `phase-01..09`, đối chiếu `plans/reports/brainstorm-261006-ui-redesign-b-plus-final-report.md` (gọi tắt BS), `plans/reports/design-261006-write-editor-screens-report.md`, `docs/project-spec.md`.

---

## Finding 1: Nút chọn font hiển thị bằng chính font làm tải Literata/Noto Serif khi chỉ mở panel, trái spec §8
- **Severity:** High
- **Location:** Phase 6, section "Requirements" (Sheet cài đặt) + "Risk Assessment"
- **Flaw:** Phase 6 yêu cầu nút font render bằng `style.fontFamily` của chính font đó, rồi ở bảng rủi ro tự chấp nhận "tải Literata/Noto (latin) khi mở panel" (M × L). Spec §8 nói rõ font khác mặc định **chỉ tải khi người đọc chọn**; phase 9 sửa dòng spec đó nhưng chỉ đổi danh sách font, vẫn giữ câu "chỉ tải khi người đọc chọn". BS tự mâu thuẫn (dòng 120 "chỉ tải khi chọn" và dòng 207 "hiển thị bằng chính font"). Plan chọn một vế mà không ghi [auto], không nêu xung đột spec, cũng không thêm vào danh sách sửa spec.
- **Failure scenario:** Người đọc chỉ mở "Cài đặt hiển thị" để chỉnh cỡ chữ. Trình duyệt tải ngay file woff2 của Literata và Noto Serif (latin, cộng vietnamese nếu nhãn có dấu) dù họ không chọn font nào. Spec bị vi phạm. `layout.spec.ts` chỉ kiểm `/` nên không phát hiện.
- **Evidence:** `docs/project-spec.md:263` ("Font khác mặc định chỉ tải khi người đọc chọn"); `phase-06-trang-doc.md:26` (nút font `style.fontFamily`); `phase-06-trang-doc.md:151` (rủi ro được chấp nhận); `apps/web/src/styles/reader.css:28` (comment "their files are only fetched once the reader picks them"); code hiện tại render nhãn font bằng chữ thường `apps/web/src/components/reader/reader-settings-sheet.tsx:96-101`; `apps/web/e2e/layout.spec.ts:44-57` chỉ kiểm `/`; BS `:120` và `:207` mâu thuẫn nhau.
- **Suggested fix:** Nút font hiển thị bằng font UI, chỉ phần "Aa" của font đang chọn (đã tải) render bằng font thật; hoặc nếu giữ preview thì ghi [auto] "sửa spec §8 dòng 263" vào phase 9 và đưa vào danh sách câu hỏi cho user. Thêm e2e: mở sheet cài đặt ở trang chương, không có request `literata|noto-serif`.

## Finding 2: "Chương X / Y", thanh tiến độ và "Còn N chương" ở "Đọc tiếp" dùng hai đại lượng không cùng nghĩa; mâu thuẫn quyết định [auto] của chính plan về `/library`
- **Severity:** High
- **Location:** Phase 4, section "Requirements" (Đọc tiếp) + "Risk Assessment"; `plan.md` "Quyết định đã chốt"
- **Flaw:** Số chương được cấp tăng dần lúc tạo, tính cả nháp và chương đã xoá mềm, còn `chapterCount` chỉ đếm chương đã đăng, chưa xoá. Plan lấy `chapterNumber / chapterCount` để ra tỉ lệ và số chương còn lại. `plan.md:70` từ chối thanh tiến độ ở `/library` đúng vì lý do "xấp xỉ do số chương có khoảng trống", nhưng phase 4 lại làm đúng thứ đó ở trang chủ. Hai quyết định [auto] trái nhau.
- **Failure scenario:** Truyện có chương 1–3 đã xoá mềm, chương 4–10 đã đăng (`chapterCount` = 7). Người đọc ở chương 9 thấy "Chương 9 / 7", thanh đầy 100% (do clamp), "Còn N chương" bị ẩn (max 0), trong khi thực tế còn chương 10 chưa đọc. Với truyện mà tác giả đã tạo nháp chương 11 rồi đăng chương 12, số liệu cũng lệch.
- **Evidence:** `packages/core/src/chapters/create-chapter.ts:12,30-35` (số tính cả chương xoá mềm, `max(number)+1` khi tạo nháp); `packages/core/src/publishing/counters.ts:10-15` (chỉ published, `deleted_at is null`); `packages/core/src/reading/history.ts:13-19` (`HistoryItemDto` có sẵn `chapterTitle`, `scrollPct`); `phase-04-trang-chu.md:23`, `:135` (tự ghi "xấp xỉ", chấp nhận H × L); `plan.md:62`, `plan.md:70`.
- **Suggested fix:** Bỏ "/ Y", tỉ lệ và "Còn N" (giữ thống nhất với `/library`). Hiện "Chương X · {chapterTitle}" và thanh theo `scrollPct` của chương đang đọc (dữ liệu chính xác, đã có trong DTO). Nếu muốn giữ "Còn N" thì cần API trả số chương đọc được sau vị trí, nghĩa là ngoài phạm vi, phải hỏi user.

## Finding 3: Hero "Biên tập chọn" gắn nhãn biên tập cho truyện do thuật toán (có cả truyện lấp chỗ); 3 câu hỏi mở của BS bị bỏ, plan không có Validation Log
- **Severity:** High
- **Location:** Phase 4, section "Requirements" (Hero); `plan.md` toàn bộ (không có mục câu hỏi mở / Validation Log)
- **Flaw:** Hero lấy `notable[0]` nhưng hiển thị nhãn "Biên tập chọn" ("Editor's pick"). `listNotable` khi thiếu truyện đạt chuẩn sẽ lấp chỗ bằng truyện công khai mới nhất, và câu truy vấn lấp chỗ **không** lọc `lastChapterAt`/`chapterCount`. BS:342 hỏi user rõ "chấp nhận được không, hay ẩn hero tới khi có `featured_slots`?", nhưng plan coi như đã chốt. Hai câu hỏi mở còn lại (BS:338-341: duyệt các [auto] lớn như sheet phải / slider / header không trong suốt / bỏ "Đã hoàn thành"; vẽ trang quản lý truyện trước khi cook) cũng biến mất. `plan.md` không có `## Validation Log`, mà theo CLAUDE.md dự án thì phải validate trước khi cook.
- **Failure scenario:** Site mới mở, chưa truyện nào đủ 3 chương / 10.000 chữ. Hero "Biên tập chọn" là truyện vừa tạo, 1 chương 300 chữ. Nếu truyện đã ẩn/xoá hết chương nhưng vẫn `visibility = published` thì hero là truyện 0 chương: "Xem truyện" dẫn tới trang "Truyện chưa có chương nào để đọc." Người đọc bị nói là ban biên tập chọn truyện này, trong khi không ai chọn cả.
- **Evidence:** `packages/core/src/catalog/home.ts:19-20` (NOTABLE_RULE, "stage 2 replaces this"); `:68-72` (filler chỉ `publicStoryWhere`, không `isNotNull(lastChapterAt)`); `packages/core/src/catalog/story-card.ts:101-107`; `phase-04-trang-chu.md:21-22`; BS `:338-342`; `grep -n -i "câu hỏi\|Validation Log" plan.md` → rỗng; `CLAUDE.md` mục "Vòng làm việc" (nhắc validate khi chưa có Validation Log).
- **Suggested fix:** Thêm `## Câu hỏi mở` vào `plan.md`, chép nguyên 3 câu của BS. Trong lúc chờ user: hero chỉ lấy truyện đạt `NOTABLE_RULE` (`chapterCount ≥ 3`), không có thì không render hero; đổi nhãn sang chuỗi trung tính (ví dụ "Truyện nổi bật mới") cho tới khi có `featured_slots`. Chạy `/ak:plan validate` trước khi cook phase 1.

## Finding 4: Remap nhấn trong `.reader-page` cộng với màn 18+ chuyển sang `--card` của site cho ra focus ring dưới 3:1, test tương phản không bắt được
- **Severity:** Medium
- **Location:** Phase 1, section "Requirements" (remap `.reader-page`) + "Test scenario matrix"; Phase 5, section "Requirements" (Màn 18+)
- **Flaw:** Phase 1 đặt `--primary`, `--ring`, `--primary-soft` trỏ sang `--reader-primary*` cho mọi thứ trong `.reader-page`. Phase 5 restyle `mature-gate.tsx` (dùng chung cho trang đọc, render **bên trong** `.reader-page`) sang "thẻ `--card` bo 24". `--card` theo theme OS, còn `--ring`/`--primary` theo preset đọc, nên hai bộ token bị trộn. Ma trận test chỉ kiểm `reader-primary` trên `reader-bg`/`reader-card`, không kiểm trên `--card` của site.
- **Failure scenario:** OS sáng, người đọc chọn preset "Xám tối", mở chương 18+. Màn cảnh báo là thẻ trắng `#FFFFFF`, focus ring và nút chính `#4FC2A8`: ring trên trắng chỉ ≈ 2.18:1 (< 3:1, WCAG 1.4.11). Ngược lại, OS tối + preset "Sáng": ring `#0E6B5B` trên thẻ `#181C1A` cũng rất thấp. Checkbox "Tôi xác nhận đã đủ 18 tuổi" cũng dùng ring này.
- **Evidence:** `phase-01-tokens-va-font.md:22`, `:77` (chỉ cặp reader-bg/reader-card); `phase-05-trang-truyen.md:34`; `apps/web/src/components/reader/mature-gate.tsx:49` (hiện là `bg-reader-bg`, cùng scope với preset); `apps/web/src/routes/stories.$storyKey.chapter-{$number}.tsx:91,142` (gate nằm trong `div.reader-page`).
- **Suggested fix:** Trong trang đọc giữ gate trên `bg-reader-bg`/`bg-reader-card` (cùng nguồn với nhấn), hoặc reset `--primary`/`--ring` về token site trong `.mature-gate`. Thêm cặp `card/reader-primary` cho mọi tổ hợp OS × preset vào `READER_CONTRAST_PAIRS`, hoặc ghi rõ là không áp dụng.

## Finding 5: Nút trên hero màu tag không được chỉ định tone; mặc định `outline`/`default` rớt tương phản nặng
- **Severity:** Medium
- **Location:** Phase 5, section "Requirements" (Nút desktop, `LibraryButton`) + "Related Code Files"
- **Flaw:** Phase 2 định nghĩa lại `outline` thành viền và chữ `--foreground`. `LibraryButton` có 3 nhánh render, cả 3 đều `variant="outline"`, cộng thêm dropdown trigger. Phase 5 chỉ thêm prop `className?` "áp lên nút ngoài cùng", không nói class nào, không phủ đủ 3 nhánh. Nút SSR "Đọc từ đầu" (`ContinueReadingButton` nhánh không tiến độ) là `variant` mặc định (`bg-primary`) đặt trên nền màu tag; plan chỉ nói nhánh "có tiến độ" dùng `--cover-fg`. Tiêu chí "mọi chữ trên hero dùng `--cover-fg`" không có test.
- **Failure scenario:** Light mode, truyện tag `--cover-6` `#2C3E66`: chữ "Thêm vào tủ" `#1C1D1B` trên `#2C3E66` ≈ 1.6:1, gần như không đọc được. Nút teal `#0E6B5B` đặt trên `--cover-4` `#2F5D50` thì gần như lẫn vào nền.
- **Evidence:** `apps/web/src/components/library/library-button.tsx:21-53` (3 nhánh `variant="outline"`); `apps/web/src/components/library/continue-reading-button.tsx:69-76` (nhánh SSR `<Button asChild>` mặc định); `phase-02-component-dung-chung.md:20` (outline = `--foreground`); `phase-05-trang-truyen.md:28`, `:68`.
- **Suggested fix:** Thêm prop `tone?: 'hero'` (hoặc variant `on-cover`) cho `Button`/`LibraryButton`/`ContinueReadingButton`: đặc = nền `--cover-fg` + chữ màu tag, viền = viền `--cover-fg` + chữ `--cover-fg`. Liệt kê rõ nhánh nào dùng tone nào. Thêm unit test markup: trong hero không còn class `text-foreground`/`bg-primary`.

## Finding 6: Breakpoint trang đọc lệch nhau (rail ở `md`, sheet phải ở `lg`), dải 768–1023px bị sheet đáy che chữ; lệch BS mà không ghi lý do
- **Severity:** Medium
- **Location:** Phase 6, section "Requirements" (Rail, Sheet cài đặt); Phase 2, section "Requirements" (Sheet `adaptive-*`)
- **Flaw:** `ReaderControls` chuyển sang rail desktop từ `md`, nhưng `SheetContent side="adaptive-right"` chỉ thành sheet phải từ `lg`, và `lg:pr-96` cũng chỉ áp từ `lg`. BS: rail "desktop ≥ md", cài đặt "desktop = sheet phải, không che chữ". Plan không ghi [auto] cho khoảng giữa.
- **Failure scenario:** Tablet 820px, đang ở rail kiểu desktop, bấm "Cài đặt": bật lên sheet đáy cao tới 90dvh với overlay trong suốt. Sheet che gần hết cột chữ, mà mục đích của panel là xem trước thay đổi ngay trên chữ. Mục lục (`adaptive-left`) cũng thành sheet đáy dù UI đang ở chế độ desktop.
- **Evidence:** `phase-06-trang-doc.md:23` (rail `hidden md:flex`), `:26` (`adaptive-right`, `lg:pr-96`); `phase-02-component-dung-chung.md:24` (đổi kiểu sheet ở `lg`); BS `:193`, `:204`.
- **Suggested fix:** Thống nhất một breakpoint. Hoặc rail/thanh dưới chuyển ở `lg` (khớp `reader.css` width setting `min-width:1024px`), hoặc `adaptive-*` chuyển ở `md` kèm `md:pr-96`. Ghi [auto] kèm lý do và thêm e2e ở 820px: mở cài đặt thì đoạn đầu `.reader-content` vẫn nhìn thấy được.

## Finding 7: Thanh tab dùng `<a>` tải lại toàn trang tới các route `NO_STORE`; lý do "HTML từ CDN" sai với 3/5 tab
- **Severity:** Medium
- **Location:** Phase 3, section "Requirements" (Thanh tab)
- **Flaw:** Plan cho 5 tab là `<a>` thường "tải tài liệu, HTML từ CDN". Thực tế `/library` và `/settings` trả `NO_STORE`, `/write` có `noindex` và là trang cá nhân, nên không có CDN nào đỡ. Header hiện tại dẫn tới cùng các đích bằng `Link` (điều hướng client). Hai lối vào cùng đích có hành vi khác nhau.
- **Failure scenario:** Trên mobile, mỗi lần chạm "Tủ truyện"/"Viết"/"Tôi" là một lần boot lại app: request HTML về origin, hydrate lại, gọi lại `me`, mất cache React Query (danh sách truyện, lịch sử). Mạng 3G sẽ nháy trắng và chậm, trong khi bấm cùng đích từ menu tài khoản thì tức thì. Tải origin cũng tăng theo số lần chạm tab.
- **Evidence:** `phase-03-layout-header-footer-thanh-tab.md:22`; `apps/web/src/routes/library.tsx:33`, `apps/web/src/routes/settings.tsx:28` (`headers: () => NO_STORE`); `apps/web/src/components/site-layout.tsx:123,129,157,163` (`<Link to="/library">`, `<Link to="/write">`, `<Link to="/settings">`); chỉ logo `/` dùng `reloadDocument` (`site-layout.tsx:49`).
- **Suggested fix:** Dùng `Link` cho `/library` (kèm `search={{ shelf:'reading', page:1 }}` như header), `/write`, `/settings`, `/sign-in`. Chỉ `/` (và `/search` nếu muốn) dùng `reloadDocument`, giống logo. Ghi lý do vào [auto].

## Finding 8: Thang chữ của BS §3 không được hiện thực ở phase nào nhưng phase 9 lại ghi nó vào tài liệu
- **Severity:** Medium
- **Location:** Phase 1, section "Implementation Steps" bước 8 (`app.css`); Phase 9, section "Requirements" (Docs)
- **Flaw:** BS:121 chốt thang chữ: body 15/500, small 13/500, caption 11/700, h3 16/700, letter-spacing âm −0.02 đến −0.04em cho tiêu đề lớn. Không phase nào đổi `body` (hiện vẫn 16px, weight mặc định 400) hay khai báo thang này thành token hoặc utility. Mỗi phase gõ cỡ chữ ad hoc (`text-[28px]`, `text-[13px]`...). Phase 9 viết "thang chữ" vào `docs/design-guidelines.md` như thể đã có, nên tài liệu nguồn chuẩn sẽ lệch code.
- **Failure scenario:** Toàn site đổi sang Plus Jakarta Sans nhưng thân chữ vẫn 16/400 chứ không phải 15/500 như canvas. Giao diện trông nhạt và rộng hơn mockup. Docs nói 15/500, phiên sau làm theo docs và gõ thêm `text-[15px] font-medium` rải rác, càng lệch nhau.
- **Evidence:** BS `:121`; `apps/web/src/styles/app.css:60-61` (`body { @apply bg-background font-sans text-foreground antialiased; }`, không size/weight); `phase-01-tokens-va-font.md:114` (bước 8 chỉ đổi import font, màu, radius); `phase-09-trang-phu-va-tai-lieu.md:34` (docs ghi "thang chữ"); `grep -n "15/500\|body" phase-*.md` → không có.
- **Suggested fix:** Phase 1 thêm: `body` 15px/500, khai báo `--text-*` (display/h1/h2/h3/small/caption) trong `@theme` để Tailwind sinh utility, cùng `tracking` âm cho h1/display. Phase 2 trở đi dùng các utility này thay cho số literal. Hoặc ghi [auto] "giữ 16/400" và phase 9 không ghi thang chữ chưa có.

## Finding 9: Tiêu chí gate sai sự thật và thay đổi ngoài phạm vi không ghi [auto]
- **Severity:** Medium
- **Location:** Phase 2, sections "Success Criteria", "i18n"; Phase 6, section "Requirements" (Nội dung `hr`)
- **Flaw:**
  (a) Tiêu chí "`rg 'font-serif' apps/web/src` còn đúng 6 chỗ" không đạt được: `app.css` có 2 dòng chứa `font-serif` (comment và khai báo `--font-serif`). Kết quả grep tối thiểu là 8. Nếu implementer cố ép về 6 bằng cách xoá `--font-serif: var(--font-content)` thì cả 6 chỗ nội dung được giữ sẽ mất font serif.
  (b) Phase 2 ghi "Bỏ `section_see_all`" nhưng key này không tồn tại trong `vi.json`. Scout chưa được kiểm lại.
  (c) Phase 6 đổi `hr` của **trang đọc** từ `* * *` thành vạch ngắn. BS chỉ quy định ngắt cảnh vạch ngắn cho **editor** (BS:236), không nói gì về trang đọc. Đây là thay đổi hiển thị nội dung đã đăng, trái "[auto] Scope HOLD" mà không có [auto] riêng.
- **Failure scenario:** (a) Worker cook phase 2 không bao giờ thoả success criteria, hoặc thoả bằng cách phá mapping font. (c) Mọi chương đã đăng đổi kiểu ngắt cảnh mà user chưa duyệt.
- **Evidence:** `apps/web/src/styles/app.css:22`, `:47` (`--font-serif: var(--font-content);`); `phase-02-component-dung-chung.md:133`; `grep -c '"section_see_all"' packages/shared/messages/vi.json` → 0, `phase-02-component-dung-chung.md:128`; `apps/web/src/styles/reader.css:82-91` (`content: '* * *'`); `phase-06-trang-doc.md:29`; BS `:236`; `plan.md:51` (Scope HOLD).
- **Suggested fix:** (a) Đổi tiêu chí thành `rg 'font-serif' apps/web/src --glob '*.tsx'` còn đúng 6. (b) Xoá câu về `section_see_all`. (c) Hoặc giữ `* * *` ở trang đọc và cho editor dùng cùng kiểu đó (WYSIWYG theo trang đọc), hoặc thêm [auto] có lý do và đưa vào câu hỏi cho user.

---

## Câu hỏi chưa giải quyết
- Preview font trong panel cài đặt: sửa spec §8 (bỏ "chỉ tải khi chọn") hay bỏ preview? (Finding 1)
- Hero trước Giai đoạn 2: ẩn, đổi nhãn, hay giữ "Biên tập chọn"? (Finding 3, BS:342)
- Người đã lưu `font: 'literata'` (mặc định cũ, lưu kèm mỗi lần đổi bất kỳ cài đặt nào) sẽ ở lại Literata chứ không chuyển sang Source Serif mặc định mới. Có chấp nhận không? Site chưa public nên tác động nhỏ, nhưng plan chưa nhắc tới.
