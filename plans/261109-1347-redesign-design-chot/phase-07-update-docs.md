---
phase: 7
title: "Cập nhật docs"
status: done
priority: P2
effort: "1.5h"
dependencies: [1, 2, 3, 4, 5, 6]
---

# Phase 7: Cập nhật docs

**Status:** done

## Bối cảnh chung

- Repo `/Users/jhin1m/Desktop/ducanh-project/novel-hub`, nhánh `redesign/261109`. Không đổi nhánh, không push. Worker không commit; phiên điều phối đổi Status, đánh checkbox, commit.
- Brief `plans/reports/brief-261109-1347-redesign-design-chot-report.md` mục 9. Docs viết tiếng Việt, đọc code thật trước khi ghi, không ghi điều code không làm.
- Gate: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e`.

## Overview

Đưa quyết định của brief vào `docs/project-spec.md` mục 2, 8 và `docs/design-guidelines.md`. Mục 5 đã có giai đoạn và checkbox từ phase 1.

## Requirements

### `docs/project-spec.md`

- Mục 2 hàng Font: `@fontsource/be-vietnam-pro` (giao diện, 400-800; user đồng ý 2026-11-09, tạm chấp nhận, đổi qua `--font-ui`), Source Serif 4 chỉ cho nội dung chương.
- Mục 8 sửa:
  - Không gradient vẫn đúng; hero và trang truyện dùng bìa làm mờ bằng CSS, chỉ `<img>` + `filter` + lớp phủ trơn.
  - Chữ: Be Vietnam Pro cho giao diện.
  - Font trang đọc: "Be Vietnam Pro" thay "Plus Jakarta Sans".
  - Màu nhấn: thêm ngoại lệ: một từ nhấn trong tiêu đề khu trang chủ, chữ "Say" của logo, số thứ hạng 1-3.
  - Trang chủ: hero bìa mờ, 4 ô thể loại, kệ bìa, "Đang được đọc nhiều", "Trọn bộ, đọc một mạch", "Có truyện muốn kể?". Bỏ "chip thể loại".
  - Thẻ truyện: kệ trang chủ chỉ hiện "Chương N · thể loại" và nhãn AI, 18+.
  - Trang truyện: nền bìa mờ thay dải màu tag chính; giới thiệu đầu nội dung; hàng số liệu giữ tần suất ra chương.
  - Header khách có Đăng nhập, Đăng ký; công tắc giao diện ở footer.
- Mục 5: giữ nguyên các checkbox đã đánh.

### `docs/design-guidelines.md`

| Mục | Sửa |
|-----|-----|
| Nguồn | Thêm artifact https://claude.ai/artifact/6BT5brLmxY4NmZp2wdpH5B |
| Nguyên tắc, Lớp trang trí | Bỏ "chip thể loại", "hero màu tag ở trang truyện", "icon cạnh tiêu đề mục" ở trang chủ và trang truyện; thêm bìa mờ, vạch kệ |
| Token màu | `--hero-base`, `--hero-ink`, `--hero-scrim`, `--shelf-line`; màu dự phòng ô thể loại dùng lại `--cover-N` |
| Font | Bảng `--font-ui`, cách preload (4 file UI ở `__root`, 2 file Source Serif ở route đọc), weight dùng được 400-800, nhãn lựa chọn đọc, khóa `plus-jakarta-sans` giữ để khỏi đổi dữ liệu. Bỏ "chữ N của logo". Serif: bỏ giới thiệu truyện |
| Chữ | Body 15/400 (trang đọc giữ 500), các cỡ mới của hero và kệ, tiêu đề khu trang chủ 36/700, trang truyện 26/700; `SectionHeading` 22/800 chỉ còn ở các trang khác |
| Hình khối, bóng | Bóng bìa hero (`0 26px 54px` đen 45%, trang truyện `0 24px 50px`), bóng bìa kệ |
| Bìa | `--cover-7` đất nung `#A8431F`, `--cover-8` nâu đá `#5C5346`; bỏ tím mơ, hồng trầm. Mục mức tương phản thấp nhất vẫn 5,02 |
| Component | `SiteLogo`, `CoverBackdrop`, `StoryShelfCard`, `StoryShelf`; phạm vi còn dùng `SectionHeading` |
| Layout | Header, Trang truyện, Trang chủ (thứ tự mới, khu nổi bật và cần độc giả vẫn giữ), footer có công tắc |
| Hint tài khoản | `continueRows` tối đa 1 |

## Key Insights

- Thanh Đọc tiếp cho khách chưa làm ở thời điểm này; phase 9 tự thêm đoạn của nó. Không viết trước.
- Docs dùng `grep` đối chiếu tên token và component với code thật.

## Related Code Files

| File | Việc |
|------|------|
| `docs/project-spec.md` | Sửa mục 2, 8 |
| `docs/design-guidelines.md` | Sửa theo bảng |
| `CLAUDE.md` | Không sửa |

## Implementation Steps

1. Đọc cả hai tài liệu.
2. Sửa theo danh sách, mỗi lần đối chiếu với file code liên quan.
3. Rà `grep -n "Plus Jakarta\|tím mơ\|hồng trầm\|chip thể loại\|dải màu tag\|chữ \"N\"\|icon cạnh tiêu đề\|Truyện mới đáng chú ý\|Mới cập nhật" docs/project-spec.md docs/design-guidelines.md`: chỉ còn nhắc lịch sử nếu có ghi rõ.
4. Chạy gate để chắc phần docs không làm hỏng gì.

## Test Matrix

| Mức | Kịch bản | Cách |
|-----|----------|------|
| High | Mọi token, component nêu trong docs tồn tại trong code | `grep` |
| High | Không còn mô tả cũ mâu thuẫn | `grep` bước 3 |

## Dependency Map

Sau các phase giao diện 1-6. Phase 9 bổ sung một đoạn.

## Success Criteria

- [ ] Hai tài liệu khớp code, bước rà grep sạch
- [ ] Gate xanh

## Risk Assessment

Docs lệch code nếu phase 8 phát hiện và sửa khác đi: phase 8 sửa code thì sửa luôn dòng docs tương ứng.
