# Scout 02: Trang chủ (P4), Trang truyện (P5), Trang đọc (P6)
Ngày 2026-10-06 · chỉ đọc code · spec: `plans/reports/brainstorm-261006-ui-redesign-b-plus-final-report.md` §4, §6.1–6.3, §8, §9. Đường dẫn tương đối từ `apps/web/src/` nếu không ghi khác.

## 0. Phụ thuộc chung (P1–P3 phải xong trước)
- Token chưa có: `--band`, `--primary-soft`, `--reader-card`, `--warning-soft` (tokens.css hiện chỉ có `--cover-0..9`, `--cover-fg`, `--reader-bg/fg/muted`, shadcn cơ bản). P4–P6 dùng hết.
- Màu tag: `coverPaletteIndex(slug)` ở `lib/cover-palette.ts`, đang áp bằng inline `style={{backgroundColor: var(--cover-N)}}` trong `story-cover.tsx:76`. Hero trang chủ, hero trang truyện, chấm chip thể loại đều cần → nên thêm helper `coverColorVar(slug)` cạnh `coverPaletteIndex` (DRY, test ở `cover-palette.test.ts`).
- `SiteLayout` (`components/site-layout.tsx`, 207 dòng) chưa có prop ẩn thanh tab; trang truyện cần ẩn (P3 phải thêm prop, P5 dùng). Trang đọc không dùng SiteLayout.
- `StoryCard`/`StoryGrid` dùng ở home, tag, author, search → redesign thẻ (P2) ảnh hưởng cả 4 trang.
- `lib/format.ts` ghi rõ: **không dùng thời gian tương đối** trong HTML cache (lệch cache + hydration). Brainstorm §6.3 "đăng 1 tháng trước" và §6.1 "thời gian" phải dùng `formatDate()` tuyệt đối (dd/MM/yyyy). Số chữ chính xác "2.840" = `formatDecimal(2840)`.
- Playwright chỉ có project Desktop Chrome 1280×720; test mobile tự `setViewportSize`. Locator `getByRole` bỏ qua phần tử `display:none` → nút trùng (rail desktop + thanh dưới mobile, CTA hero + CTA dính đáy) **phải ẩn bằng `hidden`/`md:hidden` (display:none)**, không dùng transform/opacity, nếu không vỡ strict mode.

## P4 Trang chủ
### 4.1 File inventory
| Path | Dòng | Vai trò | Hành động |
| --- | --- | --- | --- |
| routes/index.tsx | 84 | Route `/`, loader `getHomePage`, 2 `useMatureAwareList`, khu genre badge | Sửa (viết lại thân), giữ loader/headers/head |
| server-fns/catalog.ts | 50 | `getHomePage` server fn → core | Không sửa (trừ khi chọn phương án thêm synopsis, xem 4.2) |
| lib/use-mature-aware-list.ts | 28 | SSR list → API list khi `showMature` | Không sửa |
| lib/library.ts | 125 | `useHistory` (infinite, `GET /api/v1/reading/history`), `useContinueReading` | Không sửa, dùng lại `useHistory(enabled)` |
| lib/me.ts | — | `useMe()` → `preferences.showMature` | Dùng |
| components/story/story-card.tsx | 63 | Thẻ lưới | P2 sửa; P4 dùng biến thể hàng + lưới |
| components/story/story-grid.tsx | 22 | Lưới 2–6 cột | P2/P4 sửa (auto-fill minmax 160, mobile cuộn ngang) |
| components/story-cover.tsx | 99 | Bìa chữ/ảnh | P2 |
| components/library/continue-reading-button.tsx | 81 | `ResumeLink` (handoff vị trí cuộn) | Dùng lại trong khối "Đọc tiếp" |
| packages/core/src/catalog/home.ts | 106 | `getHomePage`, `listNotable`, `listGenres` | Không sửa (hoặc sửa nhẹ nếu duyệt synopsis) |
| packages/core/src/catalog/story-card.ts | 131 | `StoryCardDto`, `storyCardColumns` | Không sửa |
| components/home/home-genre-chips.tsx | mới | `nav aria-label="Thể loại"` chip + chấm màu | Tạo |
| components/home/home-featured-hero.tsx | mới | Hero "Biên tập chọn" | Tạo |
| components/home/home-continue-reading.tsx | mới | Khối "Đọc tiếp" client-only | Tạo |
| components/section-heading.tsx (P2) | — | Tiêu đề mục icon + h2 + dòng phụ | Dùng (P2 tạo) |

### 4.2 Dữ liệu
| Cần cho thiết kế | Nguồn | Trạng thái |
| --- | --- | --- |
| Genre chip: tên, slug, màu | `genres: TagView{slug,name,kind}` + `coverPaletteIndex(slug)` | CÓ |
| Hero: tên, tác giả, tag chính (slug→màu, name), chapterCount, status, coverUrl, isAiAssisted | `notable[0]: StoryCardDto` | CÓ |
| Hero: **giới thiệu (synopsis)** | `StoryCardDto` không có synopsis | **THIẾU**. Cắt, hoặc thêm `synopsis` vào select của `getHomePage` cho riêng notable (cùng truy vấn, `selectStoryCardsWith`, không truy vấn mới, `getHomePage` chỉ server fn dùng, không phải `/api/v1`) → cần user duyệt vì §9 cấm đổi API |
| Hero: nút "Đọc chương 1" | Số chương đọc được đầu tiên không có trong DTO | **THIẾU**. Chương 1 có thể đã xoá mềm → link `chapter-1` có thể 404. Đề xuất: nút chính "Xem truyện"/"Đọc ngay" trỏ trang truyện, bỏ "Đọc chương 1" |
| Mới cập nhật: bìa, tên, tag, wordCount, lastChapterAt, AI, 18+ | `recent: StoryCardDto[]` (24) | CÓ |
| Mới cập nhật: **tên chương mới nhất** | Không có | THIẾU → cắt (brainstorm đã cho phép) |
| "Xem tất cả" của Mới cập nhật | `/search` không có tham số sort, không có route danh sách | Không có đích hợp lý → bỏ nút |
| Đọc tiếp: bìa, tên, chương đang đọc, tên chương, scrollPct | `HistoryItemDto{story: StoryCardDto, chapterNumber, chapterTitle, scrollPct, updatedAt}` | CÓ |
| Đọc tiếp: "Chương X / Y" | `chapterNumber` / `story.chapterCount` | CÓ nhưng **xấp xỉ**: `chapterCount` = số chương đã đăng (`core/publishing/counters.ts`), số chương có lỗ khi xoá mềm |
| Đọc tiếp: "+N mới" | Không có mốc "đã đọc tới lúc nào có bao nhiêu chương" | **THIẾU nghĩa "mới"**; chỉ tính được "còn ≈ chapterCount − chapterNumber chương" (clamp ≥ 0). Đề xuất đổi chữ thành "Còn N chương" hoặc hiện `%` |
| Đọc tiếp: giới hạn 3 hàng | API trả `HISTORY_PAGE_SIZE=20`, không có tham số limit | Lấy trang 1, `slice(0,3)`; dùng chung cache `historyQueryKey` với `/library` |

**Rủi ro dữ liệu**
- Hero lấy từ SSR `notable[0]` (không bao giờ 18+). Khi `showMature` bật, `notableList` bị thay bằng list API → phải lọc bỏ hero theo `publicId` ở **cả** SSR list và API list, không phải `slice(1)`.
- `listHistory` trả cả truyện 18+ (`includeMature: true`). Khối "Đọc tiếp" phải lọc `!item.story.isMature || showMature`, nếu không vi phạm spec §7 (18+ không xuất hiện ở trang chủ khi tắt).
- Khối "Đọc tiếp" chỉ render khi `me.data` có; SSR + render đầu ở client = không có → không lệch hydration; có layout shift khi hiện aside (chấp nhận, ghi chú).

### 4.3 Test hiện có
| File | Số test | Phụ thuộc phải giữ |
| --- | --- | --- |
| e2e/catalog.spec.ts | 9 | HTML `/` chứa `normal.title`, `other.title`, chuỗi "Mới cập nhật"; không chứa 18+/nháp; `cache-control` list; không set-cookie. `getByRole('link',{name: normal.title}).first()` trên `/` phải dẫn tới trang truyện (link bìa có img "Bìa truyện X" cũng khớp substring, vẫn OK nếu trỏ trang truyện). Hydration không lỗi trên `/`. Sau bật 18+: `link{name: mature.title}.first()` **visible** trên `/` (đang nằm trong Mới cập nhật). Sau tắt: count 0 |
| e2e/layout.spec.ts | 4 | `/` có banner/contentinfo; preload font (P1 sửa) |
| e2e/header-mobile.spec.ts | 3 (×2 viewport) | `/` ở 360/390/640/768 **không tràn ngang**: chip cuộn ngang và lưới notable cuộn ngang phải `overflow-x-auto` trong container, không dùng `w-screen`/`100vw` |
| e2e/search.spec.ts | 1 dùng `/` | searchbox "Tìm kiếm" trong header (P3) |
| e2e/library.spec.ts | 4 | Không đụng `/` (chỉ `/library`, trang truyện) |

### 4.4 Cần bảo vệ bằng test
- Helper thuần (đặt `lib/home.ts` hoặc cạnh component, test bằng Vitest không cần DOM): `pickHero(notable)` + `withoutHero(list, publicId)`; `continueRows(items, showMature, max=3)`; `remainingChapters(chapterNumber, chapterCount)` (clamp). Unit test kiểu `renderToStaticMarkup` như `story-cover.test.tsx` cho chip (chấm màu `--cover-N`, link `/tags/{slug}`).
- e2e: thêm assert nhẹ "khách không thấy khối Đọc tiếp", "không tràn ngang 360 ở `/`" (đã có), hero không phải 18+.

### 4.5 Trùng lặp / rủi ro / file lớn
- Badge genre cũ ở index.tsx sẽ thay bằng chip; `Badge` vẫn dùng ở story-card.
- `ResumeLink` cứng `<Button asChild size>` không nhận `className`/`variant` → cần mở thêm prop (dùng cả ở library-item, history-list, trang truyện).
- index.tsx sẽ vượt 200 dòng nếu dồn hết → tách 3–4 component như bảng 4.1.

### 4.6 i18n
| Key gợi ý | Giá trị | Ghi chú |
| --- | --- | --- |
| home_genres | Thể loại | ĐÃ CÓ (aria-label nav chip) |
| home_genres_all | Tất cả | Mới (có `search_any` "Tất cả" nhưng khác miền, không dùng chung) |
| home_featured_label | Biên tập chọn | Mới |
| home_featured_view | Xem truyện | Mới |
| home_featured_read | Đọc ngay | Mới (nếu bỏ "Đọc chương 1") |
| home_continue_title | Đọc tiếp | Mới |
| home_continue_position | Chương {current} / {total} | Mới |
| home_continue_remaining | Còn {count} chương | Mới (thay "+N mới") |
| library_title | Tủ truyện | ĐÃ CÓ (link góc khối) |
| home_recent / home_notable / home_empty | Mới cập nhật / Truyện mới đáng chú ý / Chưa có truyện nào. | ĐÃ CÓ |
| home_recent_subtitle | Chương mới nhất từ các tác giả | Mới (dòng phụ) |
| home_notable_subtitle | Truyện mới ra, đủ dày để bắt đầu | Mới |
| story_card_chapters / story_card_words / story_card_ai / story_card_mature / story_status_* | — | ĐÃ CÓ |

## P5 Trang truyện
### 5.1 File inventory
| Path | Dòng | Vai trò | Hành động |
| --- | --- | --- | --- |
| routes/stories.$storyKey.index.tsx | 169 | Loader `getStoryPage`, header, synopsis, tag `dl`, TOC, MatureGate | Sửa lớn; sẽ > 200 → tách |
| components/story/story-meta.tsx | 42 | `dl` colophon (status, chương, chữ, pace, cập nhật) | Sửa thành hàng số liệu có vạch ngăn; status chuyển ra chip |
| components/story/story-chapter-list.tsx | 32 | `ol` TOC phẳng, toàn bộ chương | Sửa: lưới 2 cột, hàng "Mới nhất", hàng "Đang đọc" (client) |
| components/story/pagination.tsx | 43 | Phân trang list (tag, search, library, moderation) | **Không dùng ở trang truyện**; chỉ restyle pill ở P9 |
| components/chapter-list.tsx | 171 | Danh sách chương **phía tác giả** (/write) | Ngoài P5 (P7) |
| components/library/continue-reading-button.tsx | 81 | SSR "Đọc từ đầu" → client "Đọc tiếp chương N" | Sửa: nhận variant/className; khi có tiến độ hiện thêm nút viền "Đọc từ đầu" |
| components/library/library-button.tsx | 57 | "Thêm vào tủ" / "Trong tủ: …" + ShelfMenu | Chỉ style |
| components/report/report-button.tsx | 53 | "Báo cáo" ghost | Giữ, chỉ className |
| components/reader/mature-gate.tsx | 136 | Màn 18+ (`alertdialog`) dùng chung trang truyện + trang đọc | Chỉ đổi style token |
| components/story/story-hero.tsx | mới | Dải màu tag: bìa, breadcrumb, chip, h1, pill tác giả, số liệu, CTA | Tạo |
| components/story/story-sticky-cta.tsx | mới | Thanh CTA dính đáy mobile (`md:hidden`) | Tạo |
| components/story/story-author-card.tsx | mới | Thẻ tác giả rút gọn | Tạo (chỉ tên + @username + link) |
| packages/core/src/catalog/story-page.ts | 125 | `StoryPageData` | Không sửa (hoặc thêm `publishedAt` vào chapters, xem 5.2) |

### 5.2 Dữ liệu (`StoryPageData`)
| Cần | Trạng thái |
| --- | --- |
| title, synopsis, coverUrl, mainTag{slug,name}, tags[] (kind), status, chapterCount, wordCount, lastChapterAt, isAiAssisted, isMature | CÓ |
| Pace `~N/tuần` | CÓ `chaptersPerWeek` (null khi < 2 chương/30 ngày → ẩn ô) |
| Tác giả: username, displayName | CÓ |
| Tác giả: **bio, số truyện, avatar** | **THIẾU** (không select `users.bio/avatar_url`, không đếm truyện) → cắt; avatar = chữ cái đầu |
| **"Cùng tác giả"** | **THIẾU** (cần truy vấn mới) → cắt cả khối |
| Mục lục: number, title | CÓ (`chapters[]`, toàn bộ, không phân trang) |
| Mục lục: **ngày đăng từng chương** | **THIẾU trong DTO**, nhưng `listReadableChapters` ĐÃ select `publishedAt` rồi bị `map(({number,title}))` bỏ đi (`story-page.ts:119`). Thêm lại = 0 truy vấn mới, đổi DTO server-fn (không phải `/api/v1`). Cần user duyệt; không duyệt → bỏ cột ngày |
| Hàng ghim "Mới nhất" | CÓ: `chapters.at(-1)` + `story.lastChapterAt` |
| "Đang đọc" / "Đọc tiếp chương N" | CÓ ở client: `useContinueReading(publicId)` (cùng queryKey, không gọi thêm) |
| "Xem thêm N chương" | **Không có cơ chế phân trang/tải thêm hiện có** (brainstorm giả định sai). Hoặc render đủ (như nay), hoặc thu gọn bằng client (HTML vẫn đủ link, e2e cần `href=chapterPath(2)` trong HTML) |
| Breadcrumb "Trang chủ / Thể loại" | CÓ (`nav_home`, mainTag) |

### 5.3 Test hiện có
| File | Số test | Phụ thuộc phải giữ |
| --- | --- | --- |
| e2e/catalog.spec.ts | 9 (4 chạm trang truyện) | HTML chứa `normal.title`, chữ **"Đọc từ đầu"** (SSR), `href="{chapterPath(2)}"`, `href="/authors/{username}"`; cache PAGE; h1 = title; `link 'Tiên hiệp'.first()` → `/tags/tien-hiep` (breadcrumb/chip phải là link tag); không gọi `/_serverFn/`; hydrate sạch; 18+ `alertdialog` chứa "Truyện có nội dung 18+" + tag "Nội dung 18+"; noindex |
| e2e/library.spec.ts | 4 (2 chạm trang truyện) | `link 'Đọc tiếp chương 2'` **strict** (CTA dính đáy phải `md:hidden`), click → handoff vị trí; `button 'Thêm vào tủ'` → `'Trong tủ: Đang đọc'` strict (không render LibraryButton 2 lần ở cùng viewport) |
| e2e/seo.spec.ts | 9 | Meta/canonical/og/title "{title} – Tác Giả Đọc · Novel Hub" (head, không đổi) |
| e2e/stories.spec.ts | 4 | Luồng /write (P7); không chạm trang truyện công khai |
| e2e/moderation.spec.ts | — | Báo cáo từ trang đọc (xem P6) |
| core catalog.int.test.ts | `getStoryPage` kiểm `chapters.map(c=>c.number)` | Thêm `publishedAt` không vỡ test |

### 5.4 Cần bảo vệ bằng test
- `StoryMeta` mới: render static (ô pace ẩn khi null, cập nhật ẩn khi null) – unit `renderToStaticMarkup`.
- `ContinueReadingButton` mới: SSR luôn ra "Đọc từ đầu" (assert trong HTML, catalog e2e đã có).
- e2e mới: trang truyện 360px không tràn ngang (tên dài), CTA dính đáy chỉ hiện < md, tab bar ẩn ở trang truyện (P3).
- Helper `tocRows(chapters, current)` nếu tách logic "Mới nhất"/"Đang đọc".

### 5.5 Trùng lặp / rủi ro / file lớn
- `ContinueReadingButton` sẽ render 2 nơi (hero + sticky CTA) → 2 lần `useContinueReading` cùng key (dedupe OK), nhưng 2 link cùng tên → bắt buộc display:none theo viewport.
- `TagLink` cục bộ trong route + `Badge` → chuyển sang chip P2.
- Hero full-width với `margin-top: -56` cho tấm nội dung: tránh `w-screen` (tràn do thanh cuộn).
- `inert={gated}` bọc toàn bộ SiteLayout: giữ nguyên khi tách component.
- Route 169 → tách hero/sticky/author card để dưới 200.

### 5.6 i18n
| Key | Giá trị | Ghi chú |
| --- | --- | --- |
| story_page_start | Đọc từ đầu | ĐÃ CÓ (bắt buộc trong SSR) |
| continue_reading | Đọc tiếp chương {number} | ĐÃ CÓ |
| story_page_read_first | Đọc chương 1 | Mới, chỉ nếu dùng; e2e cần "Đọc từ đầu" nên đề xuất giữ "Đọc từ đầu" |
| story_page_chapters / words / pace / updated / pace_value | Số chương / Số chữ / Tần suất / Cập nhật / {count} chương/tuần | ĐÃ CÓ; nhãn ngắn mới nếu cần: story_page_stat_chapters "chương", story_page_stat_words "chữ", story_page_stat_pace "ra chương", story_page_pace_short "~{count}/tuần" |
| story_page_breadcrumb | Đường dẫn | Mới (aria-label nav breadcrumb); nav_home "Trang chủ" ĐÃ CÓ |
| story_page_toc_count | Mục lục · {count} chương | Mới (story_page_toc "Mục lục" ĐÃ CÓ) |
| story_page_toc_latest | Mới nhất | Mới |
| story_page_toc_reading | Đang đọc | Mới (hoặc dùng reader_toc_current "Đang đọc" ĐÃ CÓ) |
| story_page_toc_more | Xem thêm {count} chương | Mới, chỉ nếu làm thu gọn client |
| story_page_author_title | Tác giả | Có `story_page_by` "Tác giả" ĐÃ CÓ |
| story_page_synopsis_more | Xem thêm | Mới (mobile cắt giới thiệu) |
| report_button, library_add, library_on_shelf, mature_* | — | ĐÃ CÓ |

## P6 Trang đọc
### 6.1 File inventory
| Path | Dòng | Vai trò | Hành động |
| --- | --- | --- | --- |
| routes/stories.$storyKey.chapter-{$number}.tsx | 146 | Loader, hooks (nav visibility, arrow keys, progress, resume, beacon), header chương, content, end | Sửa; tách header chương |
| components/reader/reader-nav.tsx | 79 | Thanh trên fixed: TOC, tên chương, prev/next, settings | Viết lại → thanh trên (back + 2 dòng + progress 2px) |
| components/reader/reader-bottom-bar.tsx | mới | `nav "Điều hướng chương"` < md: Mục lục/Trước/Sau/Cài đặt | Tạo |
| components/reader/reader-rail.tsx | mới | Rail dọc ≥ md | Tạo (có thể gộp với bottom-bar: 1 component, 2 layout CSS) |
| components/reader/chapter-toc-sheet.tsx | 90 | Sheet + **trigger nội bộ** + query TOC | Sửa: controlled `open/onOpenChange`, bỏ trigger; side left desktop / bottom mobile |
| components/reader/reader-settings-sheet.tsx | **244** | Sheet non-modal + ChoiceGroup + RangeField | Sửa: controlled, side right/bottom, restyle; **tách** `reader-settings-controls.tsx` |
| components/reader/chapter-end.tsx | 40 | Nút "Chương tiếp", lời nhắn, ReportButton | Sửa: thứ tự lời nhắn → nút → "Chương trước"; **giữ ReportButton** |
| components/reader/chapter-content.tsx | 34 | HTML + sentinel 70% | Không đổi |
| components/reader/chapter-header.tsx | mới | Pill "Chương N", h1, meta | Tạo |
| components/reader/mature-gate.tsx | 136 | Màn 18+ | Chỉ style |
| lib/reader/use-nav-visibility.ts | 51 | hidden khi cuộn xuống, tap giữa | Giữ; trả `hidden` cho cả 3 thanh |
| lib/reader/scroll.ts | 51 | `scrollPctOf` | Dùng lại cho thanh tiến độ 2px |
| lib/reader/use-scroll-progress.ts | mới | rAF scroll → % (ghi thẳng style qua ref, không setState mỗi frame) | Tạo |
| lib/reader/use-arrow-keys.ts | 35 | ←/→, tắt khi có `[role=dialog]` | Không đổi |
| lib/reader/use-reading-progress / use-resume-scroll / use-view-beacon / use-prefetch-next | 81/52/62/45 | Tiến độ, khôi phục, beacon, prefetch | Không đổi |
| lib/reader/settings.ts, use-reader-settings.ts | 104/123 | Áp cài đặt; enum font (P1) | Không đổi ở P6 |
| styles/reader.css | 117 | Biến reader, `.reader-nav[data-hidden]` translateY(-100%), focus-within | Sửa: thêm trạng thái ẩn cho thanh dưới (translateY(100%)) và rail (opacity/translateX), padding đáy cho thanh dưới, progress |

### 6.2 Dữ liệu (`ChapterPageData`)
| Cần | Trạng thái |
| --- | --- |
| Tên truyện, slug, publicId (link back) | CÓ |
| Chương: number, title, html, authorNote | CÓ |
| Meta "N chữ · đăng {ngày}" | CÓ `wordCount`, `publishedAt: Date` → **dùng `formatDate` tuyệt đối**, không "1 tháng trước" |
| "Lời nhắn của {tác giả}" | CÓ `authorDisplayName`; avatar ảnh **THIẾU** → chữ cái đầu |
| prev/next | CÓ `prevNumber`/`nextNumber` |
| Tên chương kế trên nút "Chương tiếp" | THIẾU → cắt (brainstorm đã cắt); có thể thêm "Chương {nextNumber}" |
| Tổng số chương (Ch. X / Y) | THIẾU (không cần cho thiết kế) |
| TOC: number, title | CÓ (`getChapterToc`, tải khi mở) |
| Thanh tiến độ 2px | Client, từ `scrollPctOf(contentRef)` |

### 6.3 Test hiện có
| File | Số test | Phụ thuộc phải giữ |
| --- | --- | --- |
| e2e/reader.spec.ts | 10 | `.reader-content p[data-pid]`; **`heading level 1` toHaveText 'Chương 2'** (exact, chương không tên, cả khi tắt JS) → khi không có title, h1 phải đúng "Chương N"; pill không được nằm trong h1; chỉ **1 h1** (ngoài h1 của mature-gate). `link 'Chương tiếp'` strict (aria-label "Chương sau" không đụng). `getByText('Đã hết chương mới')` strict. `button 'Mục lục'` strict ở 1280 → bottom bar `md:hidden`. TOC `dialog` chứa link `/^Chương \d/` đúng 3, `aria-current=page`. ←/→ không chạy khi TOC mở. `link[rel=prefetch]` ở viewport 1280×400. Lời nhắn plain text, **`footer b` count 0** (giữ `<footer>` của ChapterEnd, không render HTML) |
| e2e/reader-settings.spec.ts | 5 | `button 'Cài đặt hiển thị'` strict (1280 và 375); `dialog name 'Cài đặt hiển thị'`; radio trong `label` (click label theo radio exact); slider "Cỡ chữ"; "Khôi phục mặc định"; `--reader-column` 60ch/68ch; "Độ rộng cột chữ" ẩn ở 375 (fieldset `hidden lg:flex`); h1 `toBeFocused` sau bật 18+ (giữ `tabIndex=-1`) |
| e2e/reader-progress.spec.ts | 4 | 390×600, đo `.reader-content`; PUT progress; beacon 30 s; không cookie |
| e2e/header-mobile.spec.ts | 3 | Trang đọc 360/390 không tràn ngang → rail ẩn (display:none) dưới md |
| e2e/moderation.spec.ts | 1 chạm | `button 'Báo cáo'` trên trang đọc → `dialog 'Báo cáo chương'`. Brainstorm §6.3 không nhắc ReportButton nhưng **phải giữ** ở cuối chương |
| e2e/publish.spec.ts, editor.spec.ts | — | `link 'Về trang truyện'` là của editor (P8). Thanh trên trang đọc thêm link cùng tên: OK (khác trang) nhưng TOC sheet có link "Về trang truyện: {title}" → khi TOC mở có 2 link khớp substring; chưa test nào dùng trên trang đọc |
| Unit: lib/reader/{scroll,settings,resume-handoff}.test.ts, boot-script.test.ts, tokens.test.ts | — | Không đổi logic |

### 6.4 Cần bảo vệ bằng test
- `chapterHeading(chapter)`: h1 = title ?? "Chương N"; pill chỉ hiện khi có title (tránh "Chương 2" lặp) – unit test thuần.
- `useScrollProgress`: tách hàm thuần (đã có `computeScrollPct` test) → chỉ test wiring nhẹ hoặc bỏ.
- e2e mới: 375 → thanh dưới có 4 ô, `Chương trước` disabled ở chương 1; 1280 → rail hiện, thanh dưới ẩn; tab bar site ẩn ở trang đọc (P3).
- Giữ e2e hiện có xanh là bảo vệ chính cho ReaderNav/ChapterEnd/sheets.

### 6.5 Trùng lặp / rủi ro / file lớn
- **Trigger trùng**: Mục lục/Cài đặt xuất hiện ở bottom bar + rail. Không render 2 `<Sheet>` (2 dialog). Đưa state `open` lên route (hoặc hook nhỏ `useReaderPanels`), mỗi sheet 1 instance controlled, trigger là button thường `aria-expanded`/`aria-haspopup="dialog"`. Rail đánh dấu ô đang mở bằng state này.
- **Side theo viewport**: Radix `side` tĩnh → cần hook `useMediaQuery('(min-width: 768px)')` (chỉ đọc khi mở, sheet đóng ở SSR nên không lệch hydration). Không thêm dependency.
- `reader-settings-sheet.tsx` 244 dòng > 200 → tách controls. `reader-nav.tsx` viết lại.
- Brainstorm: rail ≥ md (768) nhưng độ rộng cột chỉ áp ≥ lg (1024, `reader.css`) và fieldset "Độ rộng cột chữ" `hidden lg:flex` (e2e 375 cần ẩn). Giữ breakpoint lg cho cột; rail md là độc lập.
- `.reader-nav:focus-within { transform: none }` phải áp cho cả 3 thanh (bàn phím).
- Thanh dưới fixed 72px che cuối nội dung → `main` thêm `pb` tương ứng < md; nút "Chương tiếp" vẫn click được (e2e chạy 1280 nên an toàn).
- `main pt-20` hiện khớp thanh 48px; thanh mới 56/60 → chỉnh padding.
- Mature-gate dùng chung P5/P6: đổi style một lần.

### 6.6 i18n
| Key | Giá trị | Ghi chú |
| --- | --- | --- |
| reader_nav_label | Điều hướng chương | ĐÃ CÓ (bottom bar/rail; thanh trên đổi sang `<header>` để không trùng tên nav) |
| reader_back_to_story | Về trang truyện | Mới (hoặc dùng `reader_toc_story`/`editor_back` cùng giá trị; nên key riêng) |
| reader_bar_chapter | Ch. {number} | Mới (dòng 2 thanh trên) |
| reader_prev / reader_next | Chương trước / Chương sau | ĐÃ CÓ (aria-label) |
| reader_prev_short / reader_next_short | Trước / Sau | Mới (chữ hiển thị, nằm trong aria-label) |
| reader_settings | Cài đặt hiển thị | ĐÃ CÓ |
| reader_settings_short | Cài đặt | Mới |
| reader_toc | Mục lục | ĐÃ CÓ |
| reader_chapter_label | Chương {number} | ĐÃ CÓ (pill, h1 fallback) |
| reader_chapter_meta | {words} chữ · đăng {date} | Mới |
| reader_progress_label | Tiến độ đọc chương | Mới (nếu progress có role; nếu `aria-hidden` thì không cần) |
| reader_author_note_by | Lời nhắn của {name} | Mới (`reader_author_note` "Lời nhắn của tác giả" ĐÃ CÓ) |
| reader_end_next / reader_end_latest | Chương tiếp / Đã hết chương mới | ĐÃ CÓ |
| reader_keyboard_hint | Dùng phím ← → để chuyển chương | Mới (desktop) |
| reader_settings_* (theme, font, size, width, align, reset) | — | ĐÃ CÓ; font labels đổi ở P1 |

## Câu hỏi mở / quyết định cần chốt (đề xuất mặc định trong ngoặc)
1. Hero trang chủ: thêm `synopsis` vào `getHomePage` (server fn, 0 truy vấn mới) hay cắt giới thiệu? (đề xuất: cắt, giữ §9; hỏi user khi dậy)
2. Hero "Đọc chương 1": số chương đọc được đầu tiên không có trong DTO → (đề xuất: nút "Xem truyện" + bỏ "Đọc chương 1")
3. Đọc tiếp "+N mới": không có dữ liệu "mới" → (đề xuất: "Còn N chương", xấp xỉ, clamp ≥ 0)
4. Mục lục trang truyện có ngày đăng: thêm `publishedAt` vào `StoryPageData.chapters` (đã select sẵn, chỉ bị bỏ khi map) hay bỏ cột ngày? (đề xuất: hỏi; mặc định bỏ ngày)
5. "Xem thêm N chương": không có cơ chế phân trang hiện có → (đề xuất: render đủ như nay; YAGNI)
6. Thẻ tác giả: chỉ tên + @username + link (bio, số truyện, "Cùng tác giả" cắt).

**Status:** DONE_WITH_CONCERNS
**Summary:** Đã scout đủ P4–P6: bảng file, nguồn dữ liệu, ràng buộc e2e, chuỗi i18n. Phần lớn thiết kế đã có dữ liệu sẵn; thiếu synopsis/chương đầu cho hero, "+N mới", ngày đăng mục lục, bio/số truyện/"Cùng tác giả" → cần cắt hoặc user duyệt đổi DTO server fn.
**Concerns/Blockers:** Brainstorm giả định sai 2 điểm (trang truyện không có phân trang mục lục; thời gian tương đối trái quy tắc cache ở `lib/format.ts`). Rủi ro chính: lộ 18+ qua khối "Đọc tiếp"/hero khi list API thay SSR; strict mode e2e khi nút trùng ở rail/thanh dưới/CTA dính đáy; h1 trang đọc phải đúng "Chương N"; ReportButton cuối chương phải giữ.
