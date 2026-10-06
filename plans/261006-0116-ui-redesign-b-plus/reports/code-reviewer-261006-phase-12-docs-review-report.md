# Review phase 12: Tài liệu và spec (docs-only)

## Scope
- Files: `docs/project-spec.md` (§2 hàng Font, §8), `docs/design-guidelines.md` (viết lại), `docs/deployment-cloudflare.md` (+1 đoạn purge)
- Đối chiếu: `apps/web/src/styles/{tokens,app,reader}.css`, `routes/__root.tsx`, `routes/index.tsx`, `routes/stories.$storyKey.{index,chapter-{$number}}.tsx`, `components/{ui/*,status-badges,section-heading,tag-chip,page-shell,segmented-link-classes,site-layout,site-header,mobile-tab-bar,story-cover,static-page}`, `components/story/*`, `components/reader/*`, `components/home/*`, `lib/{cover-palette,cache-headers,main-nav,home}.ts`, `lib/reader/*`, `packages/shared/src/schemas/reader.ts`, `vi.json`, `apps/web/package.json`

## Acceptance criteria
| Tiêu chí | Kết quả |
| --- | --- |
| Hàng "Font" §2 (4 package, vai trò) | OK, khớp `apps/web/package.json:14-17` |
| §8 đủ 10 vị trí (246, 250, 251, 253, 263, 267, 268, 273–275, 279–280) | OK |
| Không đổi checkbox spec | OK (`git diff` không có dòng `- [ ]`/`- [x]`) |
| Chỉ 3 file docs đổi | OK (`.claude/` untracked, ngoài phạm vi) |
| design-guidelines đủ chủ đề (nguồn canvas, token, khu đọc, font, chữ, bo góc, bóng, focus, bìa, component, layout, breakpoint) | OK |
| Đoạn purge sau deploy/rollback | OK; `PUBLIC_CACHE` s-maxage=86400 đúng (`cache-headers.ts:7-9`), `.output/public/assets/` đúng |
| grep (e) | 0 kết quả |
| Không tham chiếu plan/finding code trong docs | OK |
| Tiếng Việt có dấu | OK |
| `prettier --check` 3 file | OK (lưu ý: `docs/` **không** nằm trong `.prettierignore` như phase file ghi, nhưng file vẫn pass) |

Đã kiểm khớp code: mọi hex token light/dark, 6 preset + `--reader-card`/`--reader-primary*`, preload 4 woff2, `LEGACY_READER_FONTS`, defaults 19px/1.8/1em/68ch, 60ch/75ch từ `lg`, thang chữ (15/500, 28/800, 22/800, 24→38, 24→48, 11/700), bo góc 6/8/12/18/24/28, Button (44/48/64, outline 1.5px, destructive viền, disabled 0.6), Badge (`muted`, `warning`), status variants, TagChip chấm 8px, SectionHeading 34×34 + `onBand`, PageShell 1240/560, segmented classes, ON_COVER_*, bìa (gáy 5%, chữ cái 105cqw trắng/11, srcset 300w/600w), cover-2 = 5.02:1 (tính lại), FNV-1a % 10, tab bar 5 mục/72px/`aria-current`/reloadDocument cho trang công khai, `bottomInset` 3 giá trị, reader bar dưới 4 ô đúng thứ tự, rail phải, sheet `adaptive-right` (cài đặt) / `adaptive-left` (mục lục), `lg:pr-96`, cuối chương: lời nhắn → "Chương tiếp" h-16 → "Chương trước", nhãn hero "Mới đáng chú ý", tap giữa màn hình hiện thanh, MatureGate ngoài `.reader-page`.

## Sai lệch thật (docs vs code)

### Medium
1. **`docs/design-guidelines.md:77` và `:84`** — "Serif chỉ dùng cho nội dung truyện" + danh sách chỗ dùng `--font-content` thiếu/sai. Code dùng `font-serif` thêm ở:
   - giới thiệu truyện: `components/story/story-synopsis.tsx:20`
   - tiêu đề chương ở trang đọc: `components/reader/chapter-header.tsx:25`
   - thân văn bản trang điều khoản/quy định: `components/static-page.tsx:36` (không phải nội dung truyện)
   - chữ "N" của logo: `components/site-header.tsx:31` (UI)
   - mẫu "Aa" ở ô chọn màu nền: `components/reader/reader-settings-controls.tsx:120`
   Sửa: dòng 77 thêm "giới thiệu truyện, tiêu đề chương, thân trang điều khoản"; dòng 84 đổi thành "Serif cho nội dung truyện và văn bản dài (giới thiệu, trang điều khoản); ngoại lệ trang trí: chữ N của logo, mẫu Aa ở bảng màu nền. Tiêu đề giao diện dùng sans đậm."

### Low
2. **`docs/design-guidelines.md:103`** — `xl 24 (khối, sheet, dialog)`: sheet không dùng `rounded-xl`; sheet adaptive là `rounded-t-[28px]` dưới `lg`, `rounded-none` từ `lg` (`components/ui/sheet.tsx:45`). Sửa: bỏ "sheet" khỏi `xl` (mục `2xl` đã ghi "cạnh trên sheet mobile").
3. **`docs/design-guidelines.md:104`** — "chỉ có `shadow-xs` cho pill đang chọn trong tab group": còn ô đang chọn của nhóm lựa chọn trong bảng cài đặt đọc (`components/reader/reader-settings-controls.tsx:36`, `peer-checked:shadow-xs`). Sửa: "... tab group và nhóm lựa chọn dạng viên ở bảng cài đặt đọc". (Phụ: số trong ngoặc `0 24px 60px` 25% chỉ đúng cho dialog; bìa hero là `0 20px 44px` 26% ở `home-featured-hero.tsx:60` và `0 22px 48px` 27% ở `story-hero.tsx:83` — câu hiện tại đọc được nhưng nên tách cho rõ.)
4. **`docs/design-guidelines.md:113`** — gáy sách ghi như thuộc tính riêng của bìa chữ; code gắn `<CoverSpine />` cả cho bìa ảnh (`components/story-cover.tsx:71`). Sửa: thêm "(cả bìa ảnh)".
5. **`docs/project-spec.md:276`** — "dải nền tông trơn (`--band`) giữa các khu": code chỉ có một dải sau khu "Mới đáng chú ý"/notable ở cuối trang (`routes/index.tsx:75`), không xen giữa các khu. Sửa: "dải nền tông trơn (`--band`) sau một khu" (khớp design-guidelines:45).
6. **`docs/design-guidelines.md:166`** — "desktop có ô tìm kiếm pill, nav, nút tài khoản": nav (Tủ truyện, Viết) chỉ hiện khi đã đăng nhập (`components/site-header.tsx:96-97`). Sửa: "nav (khi đã đăng nhập)".

## Quan sát code (không phải lỗi docs, không chặn)
- Nút đóng dialog/sheet vẫn kiểu shadcn `focus:ring-2 focus:ring-offset-2` (`components/ui/dialog.tsx:65`, `components/ui/sheet.tsx:92`), lệch quy tắc focus `focus-visible:ring-[3px] ring-ring` mà docs ghi (docs đúng là quy tắc; code là ngoại lệ còn sót).
- `chapter-header.tsx:25` dùng `font-serif` (= `--font-content`) nên tiêu đề chương không theo font người đọc chọn (Literata/Noto Serif/Plus Jakarta Sans) trong khi thân chương theo `--reader-font`. Có thể cố ý; nếu không thì dùng `font-[family-name:var(--reader-font)]` hoặc bỏ class.
- `bottomInset='none'` có trong type nhưng chưa trang nào dùng (docs ghi là giá trị hợp lệ, không sai).

## Gate
Không chạy full gate (docs-only, read-only review). `prettier --check` 3 file: pass.

## Unresolved questions
- Serif ở trang điều khoản và logo là ý đồ thiết kế (docs nên ghi ngoại lệ) hay nên đổi code sang sans? Mặc định đề xuất: ghi ngoại lệ vào docs.
