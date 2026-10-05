# Overnight autopilot: redesign B+ rồi Giai đoạn 2

Status: ready · Máy: NAS `~/novel-hub` · Branch: `overnight/261006` · Bắt đầu: 2026-10-06 đêm

Runbook cho phiên **controller** chạy trong Herdr. Controller không tự viết code; mỗi bước giao cho một **worker mới** (context sạch, tương đương `/clear`), controller chỉ điều phối, chạy gate, ghi trạng thái, commit.

## Hàng đợi

Controller cập nhật cột Trạng thái (`todo` / `doing` / `done <commit>` / `blocked: <lý do>`).

| # | Bước | Worker prompt | Trạng thái |
|---|------|---------------|------------|
| Q1 | Canvas: /write và editor, mobile + desktop | xem "Q1" bên dưới | todo |
| Q2 | Report brainstorm cuối (redesign B+) | xem "Q2" | todo |
| Q3 | Plan redesign | `/ak:plan --deep plans/reports/brainstorm-261006-ui-redesign-b-plus-final-report.md` + [chế độ tự động] | todo |
| Q4 | Validate plan redesign | `/ak:plan validate <plan-dir redesign>` + [chế độ tự động] | todo |
| Q5 | Cook từng phase redesign | `/ak:cook <plan-dir>/phase-XX-*.md --auto`, mỗi phase một worker | todo |
| Q6 | Plan Giai đoạn 2 | `/ak:plan --deep docs/project-spec.md` + [chế độ tự động] | todo |
| Q7 | Validate plan Giai đoạn 2 | `/ak:plan validate <plan-dir gđ2>` + [chế độ tự động] | todo |
| Q8 | Cook từng phase Giai đoạn 2 | như Q5 | todo |

Hết hàng đợi hoặc gặp điểm dừng cứng thì dừng.

## Quyết định user đã duyệt cho đêm nay

- Thứ tự trên; redesign trước Giai đoạn 2.
- Giai đoạn 1 còn 2 checkbox hạ tầng mở (S3 MinIO thật; backup offsite trên VPS). **Được phép** sang Giai đoạn 2; hai checkbox giữ nguyên `[ ]`.
- Tự duyệt thiết kế canvas, tự trả lời câu hỏi validate theo chính sách `[auto]`.
- Commit checkpoint sau mỗi bước xanh, trên `overnight/261006`. **Không push** (push URL đã vô hiệu).
- Dependency mới duy nhất được phép: `@fontsource-variable/plus-jakarta-sans`, `@fontsource-variable/source-serif-4` (font hướng B). Mọi dependency khác: điểm dừng.
- Redesign được sửa spec §2 và §8 cho khớp hướng B (font, bo góc, màu); ghi lý do trong plan.

## [chế độ tự động]: dán cuối mọi worker prompt

> Chế độ tự động qua đêm, user đang ngủ. Không dùng AskUserQuestion. Câu hỏi nào cũng tự chọn phương án Recommended (không có thì chọn phương án đơn giản nhất theo YAGNI), ghi vào `## Validation Log` hoặc report kèm tag `[auto]` và một dòng lý do. Đọc `CLAUDE.local.md` trước khi làm. Không commit, không push; controller commit. Xong thì in một dòng `RESULT: DONE|BLOCKED <lý do>` rồi dừng.

Nếu worker vẫn hiện hộp câu hỏi (Herdr báo `blocked`), controller chọn phương án đầu tiên (Recommended) bằng `herdr agent send-keys`, ghi câu hỏi + lựa chọn vào file trạng thái với tag `[auto]`.

## Q1: worker prompt

> Dùng công cụ Artifact: đọc canvas https://claude.ai/artifact/X7w7oUBxruy6Y47oQ4HdAo (trang "Vòng 3 · B+ đã chốt", các artboard F-*). Thêm artboard cho `/write` (danh sách truyện của tác giả) và editor chương, mỗi màn bản mobile và desktop, cùng ngôn ngữ thiết kế B+ đã chốt. Đọc trước: `plans/reports/brainstorm-261005-2224-ui-redesign-direction-handoff-report.md`, `plans/reports/researcher-261005-2225-novel-reader-sites-live-browser-report.md`, memory `ui-redesign-before-stage-2`, spec §8 "Khu viết", code hiện tại ở `apps/web/src/routes/write/`. Editor: nền trơn, trạng thái lưu nhỏ ở góc, chế độ tập trung, toolbar Tiptap gọn; giữ mọi chức năng hiện có (autosave, đăng, hẹn giờ, revision, lời nhắn tác giả). Publish lại cùng URL. Nếu không có công cụ Artifact: bỏ canvas, ghi đặc tả chi tiết từng màn (layout, thành phần, trạng thái) vào `plans/reports/design-261006-write-editor-screens-report.md`. [chế độ tự động]

Controller không commit Q1 nếu chỉ sửa artifact; nếu có report thì commit `docs: ...`.

## Q2: worker prompt

> Viết report brainstorm cuối `plans/reports/brainstorm-261006-ui-redesign-b-plus-final-report.md` gộp mọi quyết định đã chốt của redesign B+: handoff report, report live-browser, memory `ui-redesign-before-stage-2`, canvas (mọi trang, kể cả màn /write và editor vừa thêm). Nêu rõ: tokens (giá trị, light/dark/sepia, cặp tương phản), font, từng màn (home, trang truyện, trang đọc + toolbar, /write, editor, các trang phụ dùng chung layout), phần spec §2/§8 phải sửa, ràng buộc giữ accessible name cho e2e, những gì KHÔNG làm. Đủ để `/ak:plan` lên plan mà không cần đọc canvas. [chế độ tự động]

## Vòng lặp mỗi phase (Q5, Q8)

1. Mở pane mới, `herdr agent start w<N> --kind claude --pane <id> -- --permission-mode bypassPermissions`.
2. `herdr agent prompt w<N> "/ak:cook <đường dẫn tuyệt đối phase-file> --auto" ` rồi chờ bằng `herdr agent wait w<N>` (chạy nền, không `--timeout` khi thiếu `--wait`).
3. Worker xong: `herdr agent prompt w<N> "/exit"`, đóng pane.
4. Controller chạy gate: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm test:int && pnpm test:e2e` (log ra `/tmp/nh-gate.log`).
5. Xanh: cập nhật Status phase trong `plan.md` của plan đó, đánh `[x]` checkbox spec nếu phase hoàn tất một checkbox, commit Conventional Commits (không ghi tên phase/plan ID trong message), cập nhật file trạng thái.
6. Đỏ: mở **một** worker sửa với `/ak:fix` kèm 60 dòng cuối log gate + [chế độ tự động]; gate lại. Vẫn đỏ: `git stash` thay đổi của phase đó (giữ lại để sáng xem), ghi `blocked`, rồi **dừng cứng**.

Không truyền thư mục plan cho `--auto` (sẽ cook hết mọi phase). Không chạy song song (gate dùng chung port 3100 và DB test).

## Điểm dừng cứng

- Gate đỏ sau một lần sửa.
- Cần secret hoặc hạ tầng thật (S3, Cloudflare, SMTP, VPS).
- Cần dependency ngoài danh sách đã duyệt, đổi Docker/env/CI, sửa migration đã chạy.
- Worker báo `RESULT: BLOCKED` mà không có cách tự quyết theo chính sách `[auto]`.
- Đụng tới thứ ngoài `~/novel-hub` hoặc container ngoài project `novel-hub`.

Phase bị chặn mà các phase sau trong plan **không** phụ thuộc nó (theo plan.md): ghi `blocked`, bỏ qua, làm tiếp. Không chắc thì dừng.

## Giới hạn usage

Worker hoặc controller gặp thông báo hết lượt (usage limit): ghi giờ reset vào file trạng thái, chờ tới giờ đó (`sleep` chạy nền), rồi chạy lại đúng bước đang dở. Không tính là điểm dừng.

## File trạng thái

`plans/reports/overnight-261006-status.md`, ghi đè sau mỗi bước, commit cùng checkpoint:

```
# Overnight 261006: <đang chạy | xong | dừng>
Cập nhật: <giờ VN>
Đang làm: <Q# / phase>
## Đã xong
- Q1 ... <commit>
## Quyết định [auto] (sáng cần duyệt)
- ...
## Chặn / lỗi
- ...
## Lệnh tiếp theo cho user
- ...
```

## Prompt khởi động controller

Dán vào pane controller (sau khi `claude --permission-mode bypassPermissions` trong `~/novel-hub`):

```
/goal Hàng đợi trong plans/261006-0050-overnight-autopilot/plan.md đã chạy hết, HOẶC plans/reports/overnight-261006-status.md ghi "dừng" kèm lý do thuộc mục "Điểm dừng cứng".
```

rồi:

```
Bạn là controller Herdr cho đêm nay. Đọc CLAUDE.local.md, rồi plans/261006-0050-overnight-autopilot/plan.md và làm đúng theo đó từ Q1. Dùng skill herdr. Mỗi bước một worker mới. Trạng thái nằm trên đĩa, không trong context.
```

## Sáng ra

`nh-check` (trên NAS) hoặc `ssh nas nh-check` (từ Mac). Lấy code về Mac: `git fetch nas` rồi xem `nas/overnight/261006`.
