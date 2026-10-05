# Scout 03: /write, editor chương, trang phụ + docs (P7–P9)

Ngày 2026-10-06, chỉ đọc code. Nguồn: brainstorm final §6.4–6.6/7/8/9, `design-261006-write-editor-screens-report.md`. Đường dẫn tương đối từ `apps/web/src/` trừ khi ghi khác.

## Phát hiện chặn/rủi ro cao (đọc trước)

1. **P7 – strict mode "Tạo truyện mới":** `stories.spec.ts:7` gọi `getByRole('link',{name:'Tạo truyện mới'}).click()` với user **chưa có truyện**. Thiết kế có nút ở dải `--band` + CTA ở trạng thái rỗng → 2 link cùng tên hiển thị → Playwright strict violation. Chọn: trạng thái rỗng ẩn nút ở dải (chỉ còn CTA), hoặc CTA rỗng là chính nút đó. Bản mobile/desktop của nút phải là 1 node, hoặc bản ẩn phải `display:none` (role query bỏ qua node ẩn).
2. **P8 – getByText không bỏ node ẩn:** e2e dùng `getByText('8 chữ')`, `getByText('300 chữ')`, `getByText(/^Đã lưu lúc/)`, `getByText('Có thay đổi chưa đăng')`, `header.getByText('Đã đăng'|'Nháp'|'Hẹn giờ',{exact})`. Render 2 bản (desktop header + mobile dưới tên chương) dù `hidden` → strict violation. Số chữ, trạng thái lưu, badge, pill: **mỗi thứ đúng 1 node**. Số chữ đổi vị trí header ↔ dưới tên chương không làm được bằng CSS thuần (khác container) → render có điều kiện bằng `matchMedia` (route `ssr:false` nên không lệch hydrate; research-02 cảnh báo chỉ áp cho trang SSR).
3. **P8 – `role=banner` duy nhất:** `publish.spec`/`revision.spec` dùng `page.getByRole('banner')`. Header editor phải là `<header>` ngoài `<main>`, chỉ 1 cái (mobile 2 dòng vẫn chung 1 header).
4. **P8 – `chapter-editor.tsx` 553 dòng:** chắc chắn bị đụng; phải tách trước khi đổi giao diện (đề xuất ở mục P8.5). Hook có import Tiptap **phải nằm trong `components/editor/`** (ESLint `TIPTAP_IMPORT_PATTERN`, `eslint.config.*:52`, có `lint-boundaries.test.ts`).
5. **P9 – `/search` chip lọc phá e2e:** `search.spec.ts:76-78` dùng `getByLabel('Tình trạng').click()` → `option 'Hoàn thành'` → nút `Tìm` (exact). Bộ lọc là form submit, không lọc trực tiếp. Brainstorm §6.6 nói "chip/tab group" nhưng §9 nói "không thiết kế lại bố cục" → đề xuất **giữ Select** (đã đổi style qua P2), không làm chip.
6. **Spec §8 dòng 280** "Dashboard tác giả là nơi duy nhất được dày số liệu" lệch với dải số liệu `/write` → phải sửa cùng P9 (brainstorm §7 đã nêu).

## P7 `/write`

### 1. File inventory
| Path | Dòng | Vai trò | Hành động |
| --- | --- | --- | --- |
| `routes/write/index.tsx` | 96 | trang, `MyStories`, export `VISIBILITY_LABELS` | sửa (dải band + số liệu, lưới thẻ ngang, trạng thái rỗng) |
| `components/writer-gate.tsx` | 70 | gate khách/chưa xác thực/lỗi | sửa style (khối `--warning-soft`, nút Đăng nhập), giữ logic |
| `lib/stories.ts` | 114 | `useMyStories`, `useMyStory`, mutations | không sửa |
| `components/story-cover.tsx` | 99 | bìa (P2 đổi gáy + chữ cái) | dùng, `sizes` mới (112px / 76px) |
| `components/story-form.tsx` | 202 | export `STATUS_LABELS` (trùng `story/story-labels.ts:STORY_STATUS_LABELS`) | sửa: bỏ bản trùng |
| `components/story/story-labels.ts` | 14 | label map dùng chung | sửa: nhận `VISIBILITY_LABELS` (route file không nên export hằng) |
| `lib/cover-palette.ts` | 47 | `coverPaletteIndex(slug)` | dùng cho chấm màu tag chính `var(--cover-N)` |
| `lib/format.ts` | 34 | `formatWordCount`, `formatDate` | dùng cho tổng chữ |
| `lib/write-summary.ts` (+ `.test.ts`) | mới | hàm thuần cộng 3 số liệu | tạo |

### 2. Test hiện có
| File | Test | Phụ thuộc phải giữ |
| --- | --- | --- |
| `e2e/stories.spec.ts` | 4 | link `Tạo truyện mới` (duy nhất, xem chặn #1); `getByRole('listitem').filter({hasText:title})` → thẻ phải là `<li>`; trong item: `getByText('Nháp')` (chỉ 1 node chứa "Nháp"), `img` "Bìa truyện {title}" chứa tên, `link` tên chứa title (cả thẻ là link: tên accessible = toàn bộ text, vẫn khớp vì không exact); `link 'Truyện của tôi'` ở trang sửa; chữ `Đăng nhập để viết và quản lý truyện của bạn.`; `Cần xác thực email trước khi đăng truyện` (regex); meta robots noindex `/write` |
| `e2e/auth.spec.ts` | 2 | không chạm `/write` (nút `Gửi lại mail xác thực` ở `/settings`) |
| `e2e/header-mobile.spec.ts` | 3 | menuitem `Viết truyện` → URL `/write` (360/390px) |
| `e2e/seo.spec.ts` | 9 | `/write` noindex, không canonical |
| Unit | 0 | chưa có test cho `/write` |

### 3. Cần test bảo vệ
- `summarizeMyStories(stories)` → `{ stories, publishedChapters, words }` (unit: rỗng, nhiều truyện, truyện `hidden_by_mod`/`draft` vẫn được đếm).
- Map visibility → biến thể badge (Đã đăng=soft, Nháp=muted, Bị ẩn=viền destructive) nếu đặt thành hàm.
- e2e nhẹ mới (tuỳ chọn): `/write` 390px không tràn ngang; tab "Viết" `aria-current`.

### 4. Dữ liệu
`AuthorStoryView` (`packages/core/src/stories/story-view.ts:13`): publicId, slug, title, synopsis, coverUrl, mainTag{slug,name,kind}, tags, status, visibility, isMature, isAiAssisted, wordCount, chapterCount, lastChapterAt, createdAt, updatedAt. `listAuthorStories` (`core/src/stories/read-stories.ts:25`) trả **toàn bộ** truyện, không phân trang, sắp `updatedAt desc` → cộng client được.
- `chapterCount`, `wordCount` chỉ tính chương **đã đăng, chưa xoá** (`core/src/publishing/counters.ts:10-15`). Tổng "chữ" = chữ đã đăng (không gồm nháp) → nhãn nên là "chữ" ngầm hiểu đã đăng; truyện chỉ có nháp hiện "0 chương".
- Thiếu (không thêm API): số chương nháp, chữ trong nháp. "Sửa lần cuối" = `stories.updatedAt` (tự bump qua `$onUpdate` khi sửa meta, bìa, đăng/recompute; **không** bump khi autosave nháp).
- Tên tác giả cho bìa: `useMe().data.displayName` (đã có).

### 5. Trùng lặp / rủi ro / tách file
- `STATUS_LABELS` (`story-form.tsx:37`) ≡ `STORY_STATUS_LABELS` (`story/story-labels.ts:4`) → xoá bản ở story-form, dùng chung (story-form còn 196 dòng).
- `VISIBILITY_LABELS` export từ route file → chuyển sang `story/story-labels.ts`.
- Badge trạng thái lặp ở 4 nơi (`write/index.tsx:79`, `chapter-list.tsx:87`, `chapter-editor.tsx:417`, `revision-history-sheet.tsx:168`), đều `variant={status==='published'?'default':'secondary'}` → đề xuất `components/status-badges.tsx` (`StoryVisibilityBadge`, `ChapterStatusBadge`) dùng biến thể P2 (soft/muted/warning/outline-destructive).
- Lưới `minmax(520px,1fr)` tràn ngang < 552px → chỉ áp từ `lg`, mobile 1 cột.
- `write/index.tsx` sau sửa dễ > 200 dòng → tách `components/write/my-story-card.tsx` (thẻ ngang desktop+mobile 1 DOM) và `components/write/writer-stats.tsx` (dải số liệu `<dl>`).
- Badge P2 chưa có biến thể soft/warning (hiện: default/secondary/destructive/outline/ghost/link) → P7 phụ thuộc P2.

### 6. i18n mới (`packages/shared/messages/vi.json`, có sẵn: `writer_title`, `writer_new_story`, `writer_empty`, `writer_chapter_count`, `writer_updated_at` "Sửa lần cuối {date}", `story_card_words` "{count} chữ", `story_visibility_*`, `story_status_*`)
| Key | Giá trị |
| --- | --- |
| `writer_stats_label` | Tổng quan truyện của bạn (aria-label `<dl>`, tuỳ chọn) |
| `writer_stat_stories` | truyện |
| `writer_stat_published_chapters` | chương đã đăng |
| `writer_stat_words` | chữ |
| `writer_manage` | Quản lý |

## P8 Editor chương

### 1. File inventory
| Path | Dòng | Vai trò | Hành động |
| --- | --- | --- | --- |
| `routes/write/stories/$publicId/chapters/$number.tsx` | 69 | route `ssr:false`, `WriterGate`, load draft | giữ; Missing/loading đổi style |
| `components/editor/chapter-editor.tsx` | **553** | toàn bộ state, autosave wiring, publish/schedule/restore, header, main, `ChapterMetaField` | tách + sửa |
| `components/editor/editor-toolbar.tsx` | 146 | toolbar 3 nhóm, `aria-pressed` | sửa: viên nổi desktop, dính đáy mobile, cuộn ngang, undo/redo ghim phải |
| `components/editor/focus-toggle.tsx` | 61 | `useFocusMode` (localStorage, Esc) + nút | sửa style; desktop icon-only (`aria-label` sẵn) |
| `components/editor/save-status.tsx` | 37 | `saveStatusText`, `SaveStatusText` role=status | sửa: thêm chấm màu (aria-hidden) |
| `components/editor/publish-dialog.tsx` | 185 | Dialog đăng/hẹn giờ, `wordCountInRange`, `toLocalInputValue` | sửa: 520px, mobile bottom, thẻ radio, thanh đo → sẽ > 200 |
| `components/editor/revision-history-sheet.tsx` | 197 | Sheet lịch sử + preview + dialog xác nhận | sửa: 560px phải, mobile đáy gần full → sẽ > 200 |
| `components/editor/conflict-banner.tsx` | 28 | banner xung đột role=alert | style (`--card`, viền destructive, icon) |
| `components/editor/draft-restore-banner.tsx` | 32 | bản chưa lưu trên máy role=alert | style (`--band`) |
| `components/editor/schedule-banner.tsx` | 34 | banner hẹn giờ | style (`--warning-soft`, icon đồng hồ) |
| `lib/autosave.ts` | 224 | máy trạng thái autosave (13 unit test) | **không sửa** |
| `lib/draft-mirror.ts` | 131 | bản sao localStorage (6 unit test) | **không sửa** |
| `lib/chapters.ts` | 252 | request/hook chương | không sửa |
| `styles/app.css:76-121` | – | `.chapter-editor-content`, `.chapter-preview-content`, `hr` = `* * *` | sửa `hr` → vạch ngắn giữa cột (đồng bộ `styles/reader.css:82` do P6) |
| `components/ui/sheet.tsx` | 132 | có `side` top/right/bottom/left | dùng `side="bottom"` mobile |

Hiện trạng vs đặc tả:
| Phần | Hiện tại | Đặc tả |
| --- | --- | --- |
| Header | sticky `max-w-4xl` flex-wrap: back, "Chương N", badge, pill outline, (ml-auto) status, số chữ, Lịch sử, Đăng, Tập trung; toolbar trong header | 68px: back · **tên truyện nhỏ** + Chương + badge + pill · status chấm · số chữ · Lịch sử · icon Tập trung · Đăng; thứ tự Đăng sau Tập trung |
| Toolbar | trong header, flex-wrap, `aria-pressed:bg-accent` | viên nổi giữa dưới header (desktop), dính đáy (mobile), nút 40px, `--primary-soft` |
| Nội dung | `max-w-[70ch]`, `font-serif text-lg leading-[1.85]`, tên chương `text-2xl` | 680px, Source Serif 20/1.85 (mobile 18), tên chương serif 36 (mobile 26) |
| Focus mode | góc phải: status 60% + nút thoát 40% | giữ nguyên ý |
| Publish | Dialog mặc định, radio thô | dialog 520 / bottom sheet; thanh đo (vạch 300); 2 thẻ radio |
| Lịch sử | Sheet phải `sm:max-w-xl` | 560 phải / đáy gần full mobile |
| Banners | `rounded-md bg-muted` chung | 3 kiểu màu riêng + icon; notice là `<p role=status>` muted (đã đúng) |
| Lời nhắn | `border-t` + Textarea | ô `--card` bo 20 + label + hint |

### 2. Test hiện có (e2e desktop 1280×720 duy nhất; editor mobile không có e2e)
| File | Test | Phụ thuộc phải giữ |
| --- | --- | --- |
| `e2e/editor.spec.ts` | 4 | textbox `Nội dung chương`; `getByText('Chưa lưu')` (substring! đừng hiện "Có bản chưa lưu…" cùng lúc); label `Tên chương` (focus mode → count 0); `/^Đã lưu lúc/`; `getByText('8 chữ')`; `Chương đang được sửa ở nơi khác.`; `Xung đột`; nút `Tải bản mới nhất`; toolbar `Định dạng` (focus → count 0, nên toolbar phải **unmount** khi focus); nút `Chế độ tập trung`; phím Esc; `/Lỗi, thử lại sau 2s/`; link `Về trang truyện`; trang truyện: `Chưa có chương nào.`, nút `Thêm chương`, listitem `Chương 1` chứa tên + `Nháp` |
| `e2e/publish.spec.ts` | 2 | `banner` chứa `Nháp`/`Đã đăng`/`Hẹn giờ` exact; nút `Đăng` exact (disabled khi 299 chữ); `dialog` chứa `320 chữ`; nút `Đăng chương`; `.chapter-editor-content[contenteditable=false]` khi đang đăng; `Đã đăng chương.`; `Có thay đổi chưa đăng`; nút `Cập nhật` exact + nút `Cập nhật` trong dialog; `Đã cập nhật chương.`; `getByText('300 chữ')`; `dialog.getByLabel('Hẹn giờ').check()` (radio thật), `getByLabel('Giờ đăng')` có giá trị; nút `Hẹn giờ đăng`; `/^Hẹn đăng lúc/`; nút `Huỷ hẹn`; `Đã huỷ hẹn giờ, chương trở về nháp.`; trang truyện: nút `Xoá chương 1`, dialog nút `Xoá chương` |
| `e2e/revision.spec.ts` | 3 | nút `Lịch sử` (không exact); dialog `Lịch sử phiên bản`; `sheet.getByRole('listitem')` count 2/3 (sheet không có `<li>` khác), mỗi li **1 button**; `Đang đăng`; `.chapter-preview-content`; nút `Khôi phục vào bản nháp`; dialog `Khôi phục phiên bản này?` chứa body; nút `Khôi phục` exact; `/^Đã khôi phục bản lúc \d{2}:\d{2} \d{2}\/\d{2}\.$/` (notice phải là node riêng, đúng chuỗi); `Giữ bản của tôi`; `/^Có bản chưa lưu trên máy này/` count 0 |
| `lib/autosave.test.ts` | 13 | logic autosave |
| `lib/draft-mirror.test.ts` | 6 | bản sao local |

Bẫy cụ thể khi đổi UI:
- Thẻ radio: giữ `<input type=radio>` thật có label chứa "Hẹn giờ"; **không** đưa chữ "giờ đăng" vào label/mô tả thẻ radio (`getByLabel('Giờ đăng')` không exact → 2 match). Input `sr-only` vẫn `check()` được nhưng an toàn hơn để vòng radio hiện (thiết kế cũng vẽ).
- Nút mobile icon-only (Lịch sử, Tập trung, back) dùng `aria-label` = chữ cũ; nút `Đăng`/`Cập nhật` không thêm `aria-label` khác chữ.
- Toolbar mobile dính đáy và desktop viên nổi: 1 node `role=toolbar` đổi vị trí bằng CSS (`fixed bottom-0 sm:static`), không render 2 toolbar.
- Publish dialog/Revision sheet mobile: giữ `role=dialog` + tên; đổi `side`/class theo `matchMedia` hoặc class `max-sm:` trên `DialogContent` (1 node).

### 3. Cần test bảo vệ (unit, env `node`, `renderToStaticMarkup` như `story-cover.test.tsx`)
- `saveStatusText` (5 nhánh, đang export nhưng chưa test) + hàm mới `saveStatusTone(status)` → `ok|idle|problem` cho chấm màu.
- `wordCountInRange`, `toLocalInputValue` (export, chưa test); `earliestScheduleTime` (nên export để test).
- Hàm thuần mới cho thanh đo: `wordMeter(words)` → `{ ratio, minMarker }` (clamp 0–1, vạch 300/max).
- `SaveStatusText` markup: `role=status`, `data-status`, chấm `aria-hidden`.
- e2e nhẹ mới (tuỳ chọn): editor 390px — toolbar `Định dạng` hiện, nút `Đăng` hiện, không tràn ngang.

### 4. Dữ liệu
- **Tên truyện cho header:** `DraftView` (`core/src/chapters/drafts.ts:12`) chỉ có chapter, doc, updatedAt, hasUnpublishedChanges — **không có tên truyện**. Lấy bằng `useMyStory(publicId)` (API `/api/v1/me/stories/:publicId` có sẵn, query key `['me','stories',publicId]`); ẩn khi đang tải. Không cần API mới.
- Còn lại đủ: `chapter.status/scheduledAt/title/authorNote`, `words` (client), `LIMITS.chapterWords` cho thanh đo, `RevisionSummary` (createdAt, wordCount, isPublished).

### 5. Trùng lặp / rủi ro / tách file
`chapter-editor.tsx` (553) đề xuất tách, giữ nguyên logic (chỉ di chuyển):
| File mới (trong `components/editor/`) | Nội dung (dòng hiện tại) |
| --- | --- |
| `use-editor-autosave.ts` | effect gắn autosave + mirror + unload (≈ 95–170), `resolveConflict` |
| `use-chapter-publishing.ts` | `resyncAfter`, `runPublish`, `publishNow`, `schedule`, `unschedule` (≈ 205–315) |
| `use-revision-restore.ts` | `restoreRevision` (≈ 320–370) |
| `editor-header.tsx` | header desktop/mobile 1 DOM (grid areas), dùng `useMyStory` |
| `editor-banners.tsx` | xung đột, lỗi resolve, hẹn giờ, notice, lỗi banner, bản local (≈ 445–475) |
| `chapter-meta-field.tsx` | `ChapterMetaField` (≈ 478–553) |
| `chapter-editor.tsx` | state + ghép, mục tiêu < 200 |
- `publish-dialog.tsx` (185 → >200): tách `publish-word-meter.tsx` và `publish-when-fieldset.tsx` (thẻ radio + datetime).
- `revision-history-sheet.tsx` (197 → >200): tách `revision-list.tsx`, `revision-preview.tsx`, `revision-restore-confirm.tsx`.
- Rủi ro: thứ tự `editor.setEditable(false,false)` → `autosave.pause()` → `resume()` trong `finally`; khi tách hook phải giữ ref (`autosaveRef`, `mirrorRef`, `loadedRef`) chung, không tạo lại autosave theo render. Effect phụ thuộc `[editor, publicId, number]`.
- Hai `Intl.DateTimeFormat` HH:mm lặp (`save-status.tsx:5`, `draft-restore-banner.tsx:4`), `formatWords` lặp (`revision-history-sheet.tsx:26`, `chapter-editor.tsx` inline) → gom vào `editor/editor-format.ts` (nhỏ, tuỳ chọn).
- `hr` style trùng giữa `app.css` (editor) và `reader.css` (trang đọc): đổi đồng bộ, P6/P8 thống nhất 1 kiểu.

### 6. i18n mới
Không cần (đặc tả xác nhận). Dùng lại: `editor_back`, `editor_chapter_heading`, `editor_word_count`, `editor_focus_enter/exit`, `revision_history`, `revision_back` ("Danh sách phiên bản", thêm icon ←), `publish_now/later`, `publish_word_count`, `editor_author_note_hint` (giữ "Hiện ở cuối chương. Tối đa 1.000 ký tự."). Thanh đo là trang trí `aria-hidden`. Lý do nút Đăng bị khoá: không thêm (brainstorm Validation Log).

## P9 Trang phụ + docs

### 1. File inventory (áp token + component, giữ bố cục)
| Path | Dòng | Vai trò | Hành động |
| --- | --- | --- | --- |
| `routes/search.tsx` | 52 | khung trang tìm | style h1/container |
| `components/search/search-form.tsx` | 161 | ô từ khoá + 3 `FilterSelect` | style; **giữ Select** (chặn #5) |
| `components/search/search-results.tsx` | 94 | region Truyện/Tác giả | dùng thẻ hàng P2 |
| `routes/tags.$tagSlug.tsx` | 84 | tag + `story-grid` | h1, chip kind, pagination pill |
| `routes/authors.$username.tsx` | 81 | khối tác giả + lưới | style khối, không hero |
| `routes/library.tsx` | 150 | tab kệ (nav link `aria-current`) + list | tab → segmented links |
| `components/library/*` | 370 tổng | item, history, menu, resume, button | style; thanh tiến độ tuỳ chọn |
| `routes/settings.tsx` | **207** | 2 section + guest | form trong `--card` bo 24 |
| `routes/sign-in.tsx`/`sign-up`/`forgot-password`/`reset-password` | 88/82/62/85 | dùng `AuthPage` | chỉ qua `auth-ui.tsx` |
| `components/auth-ui.tsx` | 70 | `AuthPage`, `TextField`, `FormMessage`, `textLinkClass` | sửa `AuthPage` → thẻ `--card` bo 24, rộng 420–560 |
| `routes/moderation.tsx` | **203** | bộ lọc `TabLinks` + hàng chờ | style; `TabLinks` → component chung |
| `components/moderation/report-card.tsx` | **335** | thẻ báo cáo + logic hành động | tách trước khi style |
| `components/moderation/merge-tag-form.tsx`, `confirm-dialog.tsx` | 141/48 | | style |
| `routes/terms.tsx`, `content-policy.tsx` | 42/41 | dùng `StaticPage` | không sửa |
| `components/static-page.tsx` | 35 | khung văn bản | thân bài `font-serif` (Source Serif), h1 sans |
| `components/not-found.tsx` | 57 | 404 | h1 sans |
| `routes/write/stories/new.tsx` | 56 | tạo truyện | style |
| `routes/write/stories/$publicId/index.tsx` | 85 | quản lý: `ChapterList` + `CoverUpload` + form | style |
| `components/story-form.tsx` | **202** | form truyện | style + bỏ `STATUS_LABELS` trùng |
| `components/tag-picker.tsx` | 133 | Select thể loại + checkbox tag | chip = label styled, **giữ `role=checkbox`** |
| `components/cover-upload.tsx` | 139 | bìa | bo 12 |
| `components/chapter-list.tsx` | 171 | danh sách chương tác giả | badge chung, bo 18 |
| `components/report/*` | 177 | dialog báo cáo | chỉ style |

Mẫu lặp cần gom: `h1 className="font-serif text-3xl|2xl font-semibold"` ở 13 file (search, tags, authors, library, settings, moderation, auth-ui, static-page, not-found, write/index, new, $publicId, + h2 serif ở 7 chỗ). Thang mới h1 28/800 **sans** → tạo `components/page-shell.tsx` (`PageShell` container 1240 + `PageTitle`), hoặc dùng "tiêu đề mục" của P2 cho h2. Container hiện lệch: `max-w-sm/xl/2xl/3xl/5xl/6xl`.

### 2. Test hiện có
| File | Test | Phụ thuộc phải giữ |
| --- | --- | --- |
| `e2e/search.spec.ts` | 6 | region `Truyện`/`Tác giả`; `2 truyện phù hợp`; label `Tình trạng` mở Select + option `Hoàn thành`; nút `Tìm` exact; searchbox `Từ khoá`; `region Truyện > status`; searchbox header `Tìm kiếm` |
| `e2e/catalog.spec.ts` | 9 | h1 = tên truyện; link `Tiên hiệp` `.first()`; checkbox `Hiện nội dung 18+` (settings) + dialog checkbox `Tôi xác nhận đã đủ 18 tuổi`; footer `Điều khoản` `/terms`, `Quy định nội dung`; `alertdialog` |
| `e2e/library.spec.ts` | 4 | link `Đọc tiếp chương N` (count 3 trong lịch sử); menuitem `Tủ truyện`; nút `Tuỳ chọn cho {title}`; menuitemradio `Đã xong`; `Kệ này chưa có truyện nào.`; **link** `Đã xong` (tab phải còn là link); menuitem `Bỏ khỏi tủ`; `main` → heading level 3 = tên truyện (không thêm h3 khác vào `main`); listitem + nút `Xoá khỏi lịch sử`; chữ `Đăng nhập để dùng tủ truyện…`; robots noindex |
| `e2e/moderation.spec.ts` | 1 | dialog `Báo cáo chương`, label `Đạo văn`, `Mô tả thêm (không bắt buộc)`, nút `Gửi báo cáo`, status text; heading `Kiểm duyệt` level 1; thẻ là `role=article` lọc theo tên truyện; heading `Đạo văn` trong thẻ; nút `Ẩn chương` exact |
| `e2e/auth.spec.ts` | 2 | label `Tên hiển thị`/`Tên người dùng`/`Email`/`Mật khẩu`; nút `Tạo tài khoản`, `Đăng nhập` exact; `alert` text exact `Email hoặc mật khẩu không đúng.` (1 alert duy nhất); settings: `Xin chào, {name}`, `Tên người dùng: …`, nút `Gửi lại mail xác thực`, `Đã gửi mail xác thực`, nút `Đăng xuất`, `Bạn chưa đăng nhập.` |
| `e2e/stories.spec.ts` | 4 | label `Tên truyện`, `Giới thiệu`; combobox `Thể loại chính` + option `Tiên hiệp`; checkbox `Hệ thống`; `Đã chọn 2/10 tag`; checkbox `Truyện có nội dung 18+`; nút `Tạo truyện`, `Lưu thay đổi`; `Đã lưu thay đổi.`; heading `Sửa truyện`; `Chưa có bìa`; lỗi `Tên truyện phải có từ 2 đến 150 ký tự.`, `Hãy chọn thể loại chính.` |
| `e2e/seo.spec.ts` | 9 | noindex/canonical các trang phụ — không đụng nếu không đổi `head` |
| `e2e/layout.spec.ts` | 4 | font preload (P1 sửa), 404 |
| Unit | – | `lib/search.test.ts`, `seo.test.ts`, `format.test.ts` không phụ thuộc UI |

### 3. Cần test bảo vệ
- Nếu tách `report-card.tsx`: hàm thuần `storyActions`, `userActions`, `canActOn`, `actionsFor` (≈ dòng 52–123) chưa có unit test → thêm `moderation/report-actions.test.ts` trước khi di chuyển.
- `PageShell`/`PageTitle` (nếu tạo): markup h1 level 1 (moderation e2e cần level 1).
- Thanh tiến độ tủ truyện (nếu làm): hàm `storyProgress(chapterNumber, chapterCount)` clamp 0–1 (số chương có khoảng trống do xoá mềm → `chapterNumber` có thể > `chapterCount`).

### 4. Dữ liệu
- Tủ truyện: `progress = { chapterNumber, scrollPct }` + `story.chapterCount` → tỉ lệ truyện chỉ xấp xỉ (khoảng trống số chương). Đủ cho thanh trang trí; không thêm API.
- Trang tác giả: không có avatar thật? (không kiểm sâu; dùng chữ cái đầu nếu thiếu). Các trang khác đủ dữ liệu.

### 5. Trùng lặp / rủi ro / tách file
- `LibraryTabs` (`library.tsx:65`) và `TabLinks` (`moderation.tsx:107`) cùng mẫu nav link `aria-current` → 1 component segmented links (P2 "tab group", bản link). Giữ role link (e2e `link 'Đã xong'`).
- `report-card.tsx` 335 → `moderation/report-actions.ts` (logic thuần), `moderation/report-target-context.tsx` (`StoryLine`, `ChapterLine`, `TargetContext`, `UserStatusBadge`), còn lại `ReportCard`. Giữ `<article>` + heading lý do.
- `settings.tsx` 207 → tách `components/settings/mature-setting.tsx` (dòng 134–207) nếu đụng.
- `moderation.tsx` 203 → giảm khi `TabLinks` ra component chung.
- `story-form.tsx` 202 → giảm khi bỏ `STATUS_LABELS`.
- `tag-picker.tsx`: chip hoá bằng CSS trên `<li>`/`Label` (`has-[[data-state=checked]]:bg-primary`), giữ Radix `Checkbox` để e2e `checkbox 'Hệ thống'` và giới hạn 10 tag (`disabled`) còn đúng.

### 6. i18n mới
Không cần nếu thanh tiến độ tủ truyện là trang trí (`aria-hidden`, cạnh link "Đọc tiếp chương N" sẵn có). Nếu muốn thanh có nhãn: `library_progress` = "Đã đọc {read}/{total} chương".

### 7. Docs: dòng phải sửa
| File:dòng | Nội dung cũ | Sửa thành (theo brainstorm §7) |
| --- | --- | --- |
| `docs/project-spec.md:36` (sau hàng UI styling) | – | thêm hàng **Font**: plus-jakarta-sans, source-serif-4, literata, noto-serif (`@fontsource-variable/*`) |
| `project-spec.md:246` | "yên tĩnh, đậm chất sách" | "ấm, như một ứng dụng đọc"; ghi hero "Biên tập chọn" không phải banner |
| `project-spec.md:250` | màu nhấn "chốt khi dựng Design System" | nền ngà ấm + thẻ trắng, một nhấn mòng két; light/dark theo OS |
| `project-spec.md:251` | Literata nội dung, Be Vietnam Pro giao diện | Source Serif 4 / Plus Jakarta Sans |
| `project-spec.md:253` | bo góc nhỏ, bóng tối thiểu | bo góc mềm, nút/chip viên, bóng chỉ ở bìa nổi + lớp nổi |
| `project-spec.md:263` | Literata, Noto Serif, Be Vietnam Pro, Inter | Source Serif 4 (mặc định), Literata, Noto Serif, Plus Jakarta Sans |
| `project-spec.md:267` | thanh điều hướng "Chỉ gồm…" | + tên truyện nhỏ, thanh tiến độ mảnh; mobile trên+dưới, desktop rail; cài đặt desktop panel phải |
| `project-spec.md:273-275` | bìa mặc định, trang truyện "gọn như trang sách" | gáy sách + chữ cái mờ; chip thể loại, hero, dải `--band`, thanh tab 5 mục; dải màu tag ở trang truyện, nút đọc dính đáy |
| `project-spec.md:279-280` | khu viết; "Dashboard … nơi duy nhất dày số liệu" | giữ ý + "/write có dải số liệu nhỏ; dashboard đầy đủ ở Giai đoạn 2" |
| `docs/design-guidelines.md:9-10` | Design System/Mockup "chưa có" | link canvas `https://claude.ai/artifact/X7w7oUBxruy6Y47oQ4HdAo` (trang "Vòng 3 · B+ đã chốt") |
| `design-guidelines.md:16-18` | "Yên tĩnh…", nhấn đất nung, `--radius: 0.375rem`, "không bóng đổ" | hướng B+, nhấn mòng két, thang bo xs6…2xl28/full, quy tắc bóng mới |
| `design-guidelines.md:25-36` | bảng màu light/dark cũ (`#A8432A`…) | bảng token mới (§2.1, thêm `--band`, `--primary-soft`, `--warning-soft/-foreground`, `--card`) |
| `design-guidelines.md:41-53` | Be Vietnam Pro, Literata, Inter, preload Literata+BVP | font mới, preload Plus Jakarta + Source Serif 4, Literata/Noto tải khi chọn |
| `design-guidelines.md:72` | bìa: tiêu đề Literata + bút danh Be Vietnam | sans 800, gáy, chữ cái mờ `aria-hidden` |
| `design-guidelines.md:86` | `--cover-fg #FBF8F3` | `#F6F1E7` |
| `design-guidelines.md:103` | bước 2 "xoá class `shadow-*`" | trừ dialog/panel nổi theo quy tắc bóng mới |
| `design-guidelines.md:108` | `SiteLayout`… | + thanh tab mobile, ẩn ở trang truyện/đọc/editor |
| `docs/code-standards.md` | không nhắc font/màu/bo góc (đã grep) | không sửa |
| `docs/codebase-summary.md` | **không tồn tại** | không tạo (YAGNI) |
| `README.md`, `CLAUDE.md` | không nhắc font cũ | không sửa |

## Phụ thuộc giữa phase
- P7/P8/P9 cần từ P2: biến thể Badge (soft, muted, warning, outline-destructive), Button pill + size 40/44, segmented tab (bản link), tiêu đề mục, Dialog/Sheet bo 24 + responsive bottom. Từ P1: `--band`, `--primary-soft`, `--warning-soft/-foreground`, `--card`, `font-serif` = Source Serif 4. Từ P3: nav "Viết truyện" `aria-current` ở `/write`, thanh tab (editor không dùng `SiteLayout` nên tự ẩn).
- P6 và P8 cùng sửa kiểu `hr` → chốt 1 kiểu.

## Câu hỏi mở
- Trạng thái rỗng `/write`: ẩn nút ở dải hay ẩn CTA (chặn #1)? Đề xuất: không hiện dải số liệu + nút khi rỗng, chỉ khối rỗng có CTA "Tạo truyện mới".
- `/search` giữ Select thay vì chip (chặn #5)? Đề xuất giữ.
- Thanh tiến độ ở `/library`: làm (trang trí, xấp xỉ) hay bỏ (YAGNI)?
- Header editor lấy tên truyện qua `useMyStory` (thêm 1 request khi mở editor trực tiếp) chấp nhận được?

**Status:** DONE_WITH_CONCERNS
**Summary:** Đủ dữ liệu cho cả 3 phase, không cần API mới; `/write` cộng số liệu client được (chapterCount/wordCount chỉ tính chương đã đăng), editor cần thêm `useMyStory` để có tên truyện. i18n mới chỉ 4–5 key cho `/write`. Cần lưu ý: e2e strict mode ("Tạo truyện mới" ×2, số chữ/trạng thái lưu không được render 2 lần), `chapter-editor.tsx` 553 dòng phải tách trong `components/editor/`, chip lọc `/search` phá e2e, spec §8:280 phải sửa.
**Concerns/Blockers:** 4 câu hỏi mở ở trên (đều có đề xuất mặc định); e2e chỉ chạy desktop nên bố cục editor/`/write` trên mobile không có test bảo vệ.
