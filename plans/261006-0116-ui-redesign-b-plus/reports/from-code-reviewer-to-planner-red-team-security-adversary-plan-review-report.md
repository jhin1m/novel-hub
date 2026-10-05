# Red team: Security Adversary + Fact Checker cho plan `261006-0116-ui-redesign-b-plus`

Ngày: 2026-10-05 · Reviewer: code-reviewer (hostile) · Phạm vi: `plan.md`, phase 01–09, đối chiếu code bằng grep/read. Không sửa plan/code.

## Tóm tắt

Plan nhìn chung đúng ranh giới cache: phần cá nhân (Đọc tiếp, Đang đọc, tab "Tôi", nút tài khoản) đều tải ở client, hero chỉ lấy từ SSR (`includeMature: false`, `packages/core/src/catalog/home.ts:95`). Phần lớn số dòng, symbol, tên test mà plan dẫn đều đúng khi grep. Lỗ hổng thật nằm ở **màn 18+** (bất biến không được ghi ra, nên dễ mất mà không test nào bắt), ở **vòng đời asset/cache khi deploy**, và ở một chỗ di chuyển **HTML sink** mà không nói rõ hợp đồng.

Đã kiểm, **không phải lỗi** (ghi để không ai phải soát lại):
- Map alias font trong `BOOT_SCRIPT` (phase 1 bước 4): giá trị sau khi map vẫn đi qua allowlist `E[k].indexOf(v)` (`apps/web/src/lib/boot-script.ts:43`), không mở đường chèn CSS/XSS qua localStorage. Hiện không có CSP header (grep `Content-Security-Policy` rỗng), nên đổi chuỗi script không làm vỡ hash nào.
- Quyền mod/editor: server tự chặn (`packages/core/src/policies/moderation.ts:3-21`, `packages/api/src/routes/moderation.test.ts:48-50`, `packages/core/src/users/preferences.ts:38` cho `confirmAdult`). Tách `report-card.tsx`/`settings.tsx`/`chapter-editor.tsx` không thể làm quyền yếu đi ở server.
- `ChapterContent` (`dangerouslySetInnerHTML`, `components/reader/chapter-content.tsx:26`) phase 6 ghi "không đổi". Lời nhắn tác giả vẫn là plain text (`chapter-end.tsx:33-34`).

---

## Finding 1: Restyle màn 18+ không ghi bất biến "che kín + class `.mature-gate`", không test nào bắt được nếu làm hỏng
- **Severity:** High
- **Location:** Phase 5, mục "Requirements" (gạch đầu dòng "Màn 18+"); Phase 9, mục "Requirements" (dòng "Màn 18+ (đã restyle phase 5)")
- **Flaw:** Plan chỉ ghi "chỉ đổi class sang token/component mới (thẻ `--card` bo 24, nút pill); giữ `alertdialog`, nội dung, hành vi". Hiện màn 18+ đứng được nhờ ba class trên **lớp ngoài**: `mature-gate` (CSS ẩn trước khi vẽ), `fixed inset-0 z-40`, và nền **đục** `bg-reader-bg`. Câu "thẻ `--card` bo 24" mời người cook biến lớp ngoài thành một thẻ, hoặc đổi nền sang overlay kiểu Dialog mới (`bg-black/50`, phase 2), vì dialog trong repo dùng đúng kiểu đó.
- **Failure scenario:** Lúc cook, lớp ngoài thành `bg-black/50` (cho giống Dialog) hoặc chỉ còn thẻ ở giữa. Khách mở link chương 18+ (HTML cache công khai 24h) và đọc được nội dung qua lớp phủ nửa trong suốt, hoặc ngay bên cạnh thẻ. Như vậy là vi phạm spec §7 ("hiện màn cảnh báo"). e2e hiện có chỉ kiểm chữ trong `alertdialog` và việc ẩn trước khi vẽ, không kiểm nội dung phía sau có bị che không, nên gate vẫn xanh.
- **Evidence:** plan `phase-05-trang-truyen.md:34` "chỉ đổi class sang token/component mới (thẻ `--card` bo 24, nút pill)". Code: `apps/web/src/components/reader/mature-gate.tsx:49` `className="mature-gate fixed inset-0 z-40 ... bg-reader-bg ..."`; `apps/web/src/styles/reader.css:110-112` `:root[data-mature-ok] .mature-gate { display: none; }`; `apps/web/src/components/ui/dialog.tsx:34` overlay `bg-black/50`; e2e chỉ kiểm text: `apps/web/e2e/catalog.spec.ts:129-132`, `apps/web/e2e/reader.spec.ts:168-171`; chỉ kiểm việc ẩn: `apps/web/e2e/reader-settings.spec.ts:146-148`.
- **Suggested fix:** Thêm vào Requirements của phase 5 bất biến: "lớp ngoài giữ nguyên `mature-gate fixed inset-0 z-40` + nền đục (`bg-reader-bg` hoặc `bg-background`, không alpha); thẻ `--card` chỉ là khối bên trong". Thêm một e2e (trong `catalog.spec.ts` hoặc `mobile-navigation.spec.ts`): khách mở chương 18+ thì `page.locator('.reader-content')` **không** `toBeInViewport()`/bị che (hoặc `elementFromPoint` giữa màn hình nằm trong `alertdialog`). Thêm `z-index` của gate vào danh sách accessible-name/bất biến phải giữ.

## Finding 2: Phase 6 bỏ mất việc nối `inert={gated}` cho toàn bộ khung đọc mới; panel chuyển lên route, nằm ngoài vùng inert
- **Severity:** Medium
- **Location:** Phase 6, mục "Implementation Steps" bước 5, "Architecture", "Function/interface checklist"; Phase 5, mục "Risk Assessment" (dòng `inert`)
- **Flaw:** Hiện `inert={gated}` đặt trên `ReaderNav` (chứa luôn hai sheet) và trên `main`. Phase 6 tách ra `ReaderTopBar`, 2× `ReaderControls`, rồi đưa `ChapterTocSheet`/`ReaderSettingsSheet` lên route làm sheet controlled. `inert` chỉ xuất hiện dưới dạng prop **tuỳ chọn** `inert?` trong checklist. Bước 5 chỉ ghi "truyền `hidden` cho top bar và cả 2 controls", Architecture không có `inert`, Requirements của `main` cũng không nhắc. Phase 5 ghi rằng rủi ro mất `inert` được "e2e 18+" che, nhưng không e2e nào kiểm `inert`.
- **Failure scenario:** Cook làm đúng từng bước nên quên `inert`. Màn 18+ không bẫy focus (chỉ focus một lần lúc mount), nên khách bấm Tab là ra khỏi `alertdialog`, tới nút "Mục lục" trong rail/thanh dưới và mở được sheet. Sheet nằm ở `z-50`, cao hơn gate `z-40`, nên hiện **trên** màn 18+ với danh sách chương, và người dùng điều hướng được. Nếu `main` cũng mất `inert`, screen reader đọc thẳng nội dung chương phía sau.
- **Evidence:** plan `phase-06-trang-doc.md:111` "truyền `hidden` cho top bar và cả 2 controls"; `phase-06-trang-doc.md:92-93` `inert?` tuỳ chọn; `phase-05-trang-truyen.md:148` "giữ wrapper ... ; e2e 18+". Code: `apps/web/src/routes/stories.$storyKey.chapter-{$number}.tsx:94-103` (`inert={gated}` trên nav và `main`); `apps/web/src/components/reader/reader-nav.tsx:36,40,48` (sheet nằm trong nav có inert); `apps/web/src/components/reader/mature-gate.tsx:35-38` (chỉ `focus()` một lần, không trap); `apps/web/src/components/ui/sheet.tsx:31,55` (`z-50`); `grep -rn inert apps/web/e2e` rỗng.
- **Suggested fix:** Đổi `inert?` thành prop bắt buộc. Bước 5 ghi rõ: truyền `inert={gated}` cho `ReaderTopBar`, cả 2 `ReaderControls` và `main`; khi `gated` thì ép `panel = null` (không mở sheet). Đặt bất biến z-index: mọi thanh cố định của khu đọc phải `< z-40`. Thêm e2e: khách ở chương 18+, nhấn Tab vài lần thì `button 'Mục lục'` không được focus, và không có `dialog` nào mở được.

## Finding 3: Lọc 18+ ở "Đọc tiếp" chỉ có unit test cho hàm thuần; phần nối dây không test nào bắt, e2e hiện có không thể phát hiện
- **Severity:** Medium
- **Location:** Phase 4, mục "Requirements" (Đọc tiếp), "Test scenario matrix", "Risk Assessment" (dòng "Lộ 18+ qua Đọc tiếp", M × H)
- **Flaw:** API lịch sử **cố ý** trả cả truyện 18+. Spec §7 cấm truyện 18+ xuất hiện ở trang chủ khi tuỳ chọn tắt. Plan tự xếp rủi ro này M × H nhưng chỉ kiểm `continueRows` (hàm thuần). Chỗ dễ sai nằm ở phần nối dây: `me.data?.preferences.showMature === true`, lấy `pages[0]`, và trường hợp sau này có ai bỏ lọc khi refactor. Test e2e 18+ hiện có dùng user **chưa từng đọc** truyện 18+, nên luôn xanh dù "Đọc tiếp" có lộ.
- **Failure scenario:** User bật 18+, đọc chương truyện 18+ (tiến độ được ghi), rồi tắt 18+. Ở `/`, khối "Đọc tiếp" vẫn hiện bìa và tên truyện 18+ (ví dụ do truyền nhầm `showMature` từ `localStorage` hint hoặc quên lọc). `catalog.spec.ts:158-162` vẫn xanh vì user test không có lịch sử với truyện 18+.
- **Evidence:** plan `phase-04-trang-chu.md:23,66,96,131`. Code: `packages/core/src/reading/history.ts:38-41` ("18+ stories are listed"); `apps/web/src/lib/library.ts:94-108` (`useHistory`); `apps/web/e2e/catalog.spec.ts:135-162` (user mới, không có progress trên `mature`).
- **Suggested fix:** Thêm e2e vào `catalog.spec.ts` (hoặc `mobile-navigation.spec.ts`): đăng ký, bật 18+, PUT tiến độ cho `mature` qua `/api/v1/reading/progress`, tắt 18+, vào `/` và kiểm `getByRole('complementary', { name: 'Đọc tiếp' })` không chứa `mature.title`, `getByRole('link', { name: mature.title })` count 0. Ghi bất biến: chỉ dùng `useMe().data.preferences.showMature`, không dùng hint `nh:mature`/`data-mature-ok` để lọc (hint chỉ để hiển thị, `boot-script.ts:11-15`).

## Finding 4: Đổi font mặc định không áp cho người đã lưu cài đặt; câu "Literata chỉ tải khi người đọc chọn" sai với phần lớn người đọc quen
- **Severity:** Medium
- **Location:** Phase 1, mục "Requirements" (font, preload), "Function/interface checklist" (`DEFAULT_READER_SETTINGS.font`)
- **Flaw:** Cài đặt đọc được lưu **nguyên object** (localStorage và `users.preferences.reader`). Ai từng chỉnh bất kỳ thứ gì (cỡ chữ, nền) thì đã lưu `font: 'literata'` (mặc định cũ). Plan chỉ map `be-vietnam-pro` và `inter`, không đụng `literata`. Sau redesign, nhóm này vẫn đọc bằng Literata. Literata bị bỏ khỏi preload nên mỗi lần vào trang đọc họ tải font không preload (FOUT, thêm request). Họ cũng không bao giờ thấy Source Serif 4 mà user đã chốt.
- **Failure scenario:** Người đọc trung thành (đã chỉnh cỡ chữ) mở chương sau deploy: chữ nháy từ Source Serif (fallback của `--font-content`, hoặc Georgia) sang Literata. Requirement "Literata, Noto Serif chỉ tải khi người đọc chọn" sai với họ. Ở mức đo đạc, nhóm dùng nhiều nhất lại nhận trải nghiệm kém nhất.
- **Evidence:** plan `phase-01-tokens-va-font.md:26` "Preload đúng 4 file; Literata, Noto Serif chỉ tải khi người đọc chọn", `:95`. Code: `packages/shared/src/schemas/reader.ts:51,98` (enum cũ, mặc định `'literata'`); `apps/web/src/lib/reader/settings.ts:83-88` (`writeLocalSettings` ghi `JSON.stringify(settings)` nguyên object); `packages/shared/src/schemas/preferences.ts:20-21` ("Replaces the stored reader settings as a whole"); `apps/web/src/routes/__root.tsx:7-8,16-21` (Literata đang được preload).
- **Suggested fix:** Đây là quyết định của user (font do user chốt), cook không tự quyết. Đưa vào "Quyết định đã chốt" một trong hai: (a) chấp nhận và sửa câu Requirement cho đúng; (b) thêm cờ phiên bản (`v: 2`) trong `nh:reader`/prefs, chỉ map `literata → source-serif-4` một lần cho bản ghi chưa có `v`. Cách (b) đổi schema Zod, phải hỏi user.

## Finding 5: Deploy redesign làm HTML đang cache ở CDN (tới 25h) trỏ vào asset/font đã xoá; plan không có bước purge, rollback cũng không
- **Severity:** Medium
- **Location:** `plan.md`, mục "Ngoài phạm vi" (không đổi Cloudflare); Phase 1, mục "Risk Assessment" và dòng "Rollback"
- **Flaw:** Phase 1 gỡ 2 package font và đổi toàn bộ CSS/JS hash. Trang chương/truyện cache `s-maxage=86400, stale-while-revalidate=3600`, danh sách 600s. Purge tự động chỉ chạy khi **nội dung** đổi, còn "Purge Everything" là thao tác tay, không gắn với deploy. HTML cũ ở edge vẫn `preload`/link tới `be-vietnam-pro-*.woff2`, `app-<hash>.css` và chunk JS cũ. Build mới thay `.output`, nên các URL này trả 404. BOOT_SCRIPT trong HTML cũ có allowlist cũ, nên localStorage do client mới ghi (`source-serif-4`) bị reset về mặc định cũ khi gặp trang cache cũ.
- **Failure scenario:** Deploy production xong, người đọc mở chương phổ biến (đã cache): trang không có CSS, JS không hydrate. Màn 18+ vẫn hiện nhưng nút "Hiện nội dung 18+"/"Đăng nhập để đọc" không chạy (gate chỉ render action sau `useMe`), tức người đọc 18+ hợp lệ bị kẹt. Rollback theo plan ("revert + pnpm install") gặp lại đúng vấn đề theo chiều ngược.
- **Evidence:** plan `plan.md:80` "không đổi config Docker/env/CI/Cloudflare"; `phase-01-tokens-va-font.md:152` Rollback. Code: `apps/web/src/lib/cache-headers.ts:7-9,16-18`; `apps/web/src/routes/__root.tsx:5-8,16-21,40-47`; `apps/web/src/components/reader/mature-gate.tsx:71-80`; `docs/deployment-cloudflare.md:66-88` (purge theo URL nội dung, "Purge Everything" chỉ là ngoại lệ thủ công).
- **Suggested fix:** Không cần đổi config. Thêm vào phase 9 (docs) và mục Rollback một bước vận hành: "sau khi deploy (và khi rollback) redesign: Cloudflare Purge Everything ngay sau khi web mới healthy". Nếu deploy hay lặp lại, ghi rủi ro chung vào `docs/deployment-cloudflare.md`. Hiện site chưa mở public nên tác động thực tế thấp, nhưng phải có trước lần deploy production đầu tiên.

## Finding 6: Tách `revision-history-sheet.tsx` chuyển `dangerouslySetInnerHTML` sang component mới mà không ghi hợp đồng nguồn HTML
- **Severity:** Medium
- **Location:** Phase 8, mục "Related Code Files" (Create `revision-preview.tsx`), "Implementation Steps" bước 9
- **Flaw:** Đây là HTML sink thứ hai của web (sau `ChapterContent`), hiện dựa vào comment "Rendered and sanitized on the server" và đầu vào cố định `preview.data.html` từ `useRevisionPreview`. Plan tách thành `revision-preview.tsx` nhưng không ghi chữ ký hay bất biến. Lối dễ nhất là `RevisionPreview({ html: string })`: một component sink nhận chuỗi bất kỳ, sau này có thể bị tái dùng (ví dụ xem trước bản nháp local, hoặc HTML dựng ở client từ `doc_json` mà không qua `sanitizeChapterHtml`).
- **Failure scenario:** Một phase sau (hoặc chính phase 8 khi làm "Bản chưa lưu trên máy" có xem trước) truyền HTML dựng ở client vào `RevisionPreview`, sinh ra XSS ngay trong phiên tác giả. Tác giả bị chiếm phiên có thể đăng chương, ghi đè revision.
- **Evidence:** plan `phase-08-editor-chuong.md:52,107`. Code: `apps/web/src/components/editor/revision-history-sheet.tsx:129-134` (comment và sink); `packages/core/src/content/render.ts:20-22` (`renderChapterHtml` = walker + `sanitizeChapterHtml`, chỉ ở server); `packages/api/src/routes/chapters.ts:193-201`.
- **Suggested fix:** Ghi vào Requirements: `RevisionPreview` nhận DTO phản hồi API (`{ revision }` từ `useRevisionPreview`), không nhận `html: string`; giữ nguyên comment nguồn sanitize; HTML sink chỉ được phép ở `chapter-content.tsx` và `revision-preview.tsx`. Cân nhắc thêm một assert grep trong `lint-boundaries.test.ts` đếm số file có `dangerouslySetInnerHTML` (hiện 3: `__root.tsx`, `chapter-content.tsx`, `revision-history-sheet.tsx`).

## Finding 7: Fact-check: các chỗ plan dẫn sai hoặc giả định sai hợp đồng
- **Severity:** Medium
- **Location:** Phase 9, mục "Requirements" (`SegmentedLinks`), "Function/interface checklist", bước 2; Phase 6, mục "Requirements" (Sheet cài đặt); Phase 2, mục "i18n"
- **Flaw:**
  1. `SegmentedLinks({ items: { key, href, label, current }[] })` và bước 2 "giữ `href`" mặc định là tab nào cũng có `href`. Thực tế `TabLinks` ở moderation dùng `<Link to="/moderation" search={item.search}>` (object search có `tab/status/reason/page`), không có `href`. Đổi sang `<a href>` thì mỗi lần bấm tab trên trang role-gated `ssr:false` là tải lại toàn trang, gọi lại `/api/v1/me`, hàng chờ nháy về "Đang tải".
  2. Phase 6 dẫn `modal={false}` ở `reader-settings-sheet.tsx:61`, thực tế là dòng 63.
  3. Phase 2 "Bỏ `section_see_all`": key này không tồn tại trong `vi.json`.
  4. Phase 5 nói e2e 18+ bảo vệ `inert`, nhưng không e2e nào kiểm `inert` (xem Finding 2).
- **Failure scenario:** (1) Cook theo đúng chữ ký sẽ phải tự ghép query moderation thành chuỗi, dễ làm mất `tab` hoặc `reason`, hoặc đổi điều hướng client thành tải lại toàn trang. (2), (3) là nhiễu nhỏ, làm cook mất thời gian dò.
- **Evidence:** plan `phase-09-trang-phu-va-tai-lieu.md` mục Requirements ("Thay `LibraryTabs` ... và `TabLinks` (`routes/moderation.tsx:107`)"), checklist `SegmentedLinks({ label, items: { key, href, label, current }[] })`. Code: `apps/web/src/routes/moderation.tsx:107-118` (`Link ... search={item.search}`), `:32-40` (`moderationHref` có sẵn), `:44` (`ssr: false`); `apps/web/src/components/reader/reader-settings-sheet.tsx:63`; `grep section_see_all packages/shared/messages/vi.json` rỗng.
- **Suggested fix:** Cho `SegmentedLinks` nhận `renderLink`/`linkProps` (hoặc `items: { key, label, current, link: LinkProps }`) để moderation giữ `Link search=`, library giữ cách hiện tại. Sửa số dòng và bỏ dòng `section_see_all`.

---

## Ghi chú fact-check đã xác nhận đúng (mẫu)

`me.int.test.ts:94` `font: 'inter'`; `story-form.tsx:37` `STATUS_LABELS` (lưu ý đang được import ở `routes/write/index.tsx:8`); `write/index.tsx:19,79`; `chapter-list.tsx:26,87`; `chapter-editor.tsx:10,390,465,528`; `revision-history-sheet.tsx:131,160`; `story-card.tsx:56`; `library-item.tsx:50`; `app.css:57`; 36 chỗ `font-serif`; 8 file `ring-ring/70`; `history.ts:13,21-22`; `get-chapter-for-reading.ts:27`; `counters.ts:10-15`; `routes/library.tsx:65,74`; e2e `stories.spec.ts:7`, `catalog.spec.ts:103`, `reader.spec.ts:27,101,129`, `reader-settings.spec.ts:134`, `moderation.spec.ts:29`, `search.spec.ts:76,104`, `library.spec.ts:103,135`, `header-mobile.spec.ts:20`; spec dòng 36, 246–280; `@fontsource-variable/{plus-jakarta-sans,source-serif-4}@5.3.0` có trên npm.

## Unresolved questions

1. Finding 4: user muốn người đã lưu `literata` giữ Literata, hay chuyển sang Source Serif 4 (cần cờ phiên bản trong schema)?
2. Finding 5: deploy production đầu tiên có chạy trước khi plan này xong không? Nếu có, bước purge phải vào runbook deploy chứ không chỉ vào docs của plan.
