---
phase: 8
title: "Báo cáo so ảnh 1440px/390px sáng tối"
status: done
priority: P1
effort: "2h"
dependencies: [1, 2, 3, 4, 5, 6, 7]
---

# Phase 8: Báo cáo so ảnh 1440px/390px sáng tối

**Status:** done

## Bối cảnh chung

- Repo `/Users/jhin1m/Desktop/ducanh-project/novel-hub`, nhánh `redesign/261109`. Không đổi nhánh, không push, không deploy, không đụng `dcn-prod`. Worker không commit; phiên điều phối đổi Status, đánh checkbox, commit.
- Không sửa `.env`, không commit script chụp ảnh; để script trong scratchpad của phiên.
- Gate khi có sửa code: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e`.

## Overview

So trang chạy local với design, ghi báo cáo có ảnh. Đây là một điều kiện "Xong khi" của brief.

## Requirements

- Báo cáo: `plans/reports/visual-compare-261109-redesign-design-chot-report.md`. Ảnh: `plans/261109-1347-redesign-design-chot/visuals/`.
- **Bắt buộc có ảnh board.** Không có ảnh board thì đặt Status `blocked` và hỏi user, không đánh completed.
- Trang: trang chủ và trang truyện có bìa, ở 1440px và 390px, sáng và tối, tối thiểu 8 ảnh toàn trang. Thêm ảnh riêng: hero trang chủ không bìa, trang truyện không bìa, ô thể loại màu trơn dự phòng (tạm trong DB local, trả lại sau), thanh Đọc tiếp của thành viên ở 1440 và 390, trang đọc 1440 và 390 để xác nhận cột chữ không đổi so với `main`.
- Với mỗi cặp: bảng khớp / lệch / lệch chờ user xác nhận, ghi `file:line` khi là lỗi.
- Tối: board chỉ có bản sáng, nên so với token Tối và ghi rõ như vậy.
- Trang truyện 390: không có board riêng; so với cách xử lý hero của `Mobile.dc.html` và số mobile trong phase 6, ghi rõ như vậy.

## Cách chạy

```bash
pnpm infra:up
APP_URL=http://localhost:3300 BETTER_AUTH_URL=http://localhost:3300 pnpm --filter @novel-hub/web exec vite dev --port 3300 --strictPort
```

Port 3000 thuộc dự án khác. Ảnh bìa trong DB local trỏ `localhost:3399`, nên chạy trong `/private/tmp/claude-501/-Users-jhin1m-Desktop-ducanh-project-novel-hub/a9fd00a3-f3ae-451c-a75b-2fbcc2de02bb/scratchpad/covers-out`:

```bash
python3 -m http.server 3399 --bind 127.0.0.1
```

Bảng xếp hạng lấy từ Redis và do worker dựng: chạy thêm `pnpm --filter @novel-hub/worker dev`. Redis rỗng thì khu này biến mất; tạo dữ liệu theo cách `apps/web/e2e/rankings.spec.ts` làm và ghi trong báo cáo.

Thư mục tạm có thể đã mất: khi đó báo trong báo cáo và dùng `pnpm db:seed`; không tự đổi URL trong DB thật.

Chụp: script một lần đặt ở scratchpad, nạp Playwright từ `apps/web` bằng `createRequire` và chạy qua `pnpm --filter @novel-hub/web exec node <đường dẫn>`, `fullPage: true`. Theme đặt trước khi tải: `localStorage['nh:theme'] = JSON.stringify({ choice: 'dark', updatedAt: Date.now() })`. Trước khi chụp: cuộn hết trang theo từng bước để ảnh lazy và "Truyện liên quan" tải, quay lại đầu trang, đợi `networkidle`, `document.fonts.ready`, mọi `img.complete`.

## Nguồn so

Board ở artifact https://claude.ai/artifact/6BT5brLmxY4NmZp2wdpH5B. Bản `design-boards/*.dc.html` cần `support.js` và ảnh `/_blob/` nên không tự render; dùng để đọc số liệu.

Việc đầu tiên của phase: phiên điều phối lấy ảnh board 1440 và 390 lưu vào `visuals/board-*.png`, bằng Claude in Chrome (phiên đăng nhập của user) hoặc action `read` của Artifact để lấy `support.js` và ảnh rồi render local. Cả hai không được thì `blocked`, hỏi user xin PNG.

## Những lệch do plan chọn, chờ user xác nhận

Không tính là lỗi của phase, nhưng phải liệt kê ở đầu báo cáo để user quyết.

| Điểm | Lý do |
|------|-------|
| Ô thể loại nền bìa mờ thay màu trơn | Brief mục 4 (đã duyệt) |
| Nhãn hero dùng `--cover-fg` thay `#efe6d4` | AA khi ảnh sáng |
| Header khách dưới 768px có nút tròn | Trang truyện không có thanh tab |
| Số liệu trang truyện "ra chương" thay "đánh giá" | Spec mục 8 |
| Có thêm kệ Truyện nổi bật, Truyện mới cần độc giả khi có dữ liệu | Tính năng đã có trong spec |
| Chưa có thanh Đọc tiếp cho khách | Phase 9 chụp bổ sung |

## Related Code Files

| File | Việc |
|------|------|
| `plans/reports/visual-compare-261109-redesign-design-chot-report.md` | Tạo |
| `plans/261109-1347-redesign-design-chot/visuals/*.png` | Tạo |
| Code giao diện | Chỉ sửa khi lệch là lỗi, sửa cả dòng docs liên quan |

## Implementation Steps

1. Lấy ảnh board. Dựng môi trường như trên, kiểm `/api/v1/health`.
2. Chọn truyện có bìa, truyện không bìa từ DB local.
3. Chụp đủ ma trận, đặt tên `home-1440-light.png`, `story-390-dark.png`, ...
4. So với board, điền bảng theo từng khu: font, cỡ chữ, khoảng cách, màu, thứ tự, nhãn.
5. Lỗi thật thì sửa, chụp lại. Lệch lớn cần quyết định thì ghi vào báo cáo, không tự đổi.
6. Kiểm thêm: DevTools không có lỗi hydration, không gọi `fonts.googleapis.com`, `scrollWidth` không vượt ở 390.
7. Chạy gate nếu có sửa code.

## Test Matrix

| Mức | Kịch bản |
|-----|----------|
| Critical | Đủ 8 ảnh toàn trang |
| Critical | Tắt JS: hero, ô thể loại, kệ vẫn hiện đúng từ HTML |
| High | Không lỗi hydration ở trang chủ, trang truyện |
| High | Không cuộn ngang ở 390 |
| Medium | Chữ trên ảnh hero sáng vẫn đọc được |

## Dependency Map

Sau phase 1-7. Phase 9 nối thêm một mục vào báo cáo này.

## Success Criteria

- [ ] Báo cáo tồn tại, có ảnh board cạnh ảnh thật, đủ ma trận, nêu rõ phần khớp và phần lệch
- [ ] Mọi lệch là lỗi đã sửa hoặc được ghi lý do
- [ ] Gate xanh nếu có sửa code

## Risk Assessment

- Không truy cập được artifact: phase `blocked`, hỏi user xin PNG; số liệu board trong repo không thay thế được việc so ảnh.
- Dữ liệu local thiếu kiểu truyện cần chụp: tạo tạm bằng SQL trên DB local rồi hoàn lại, ghi trong báo cáo.
