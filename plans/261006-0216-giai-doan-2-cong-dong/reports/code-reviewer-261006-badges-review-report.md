# Code review phase 7: huy hiệu và cột mốc

Reviewer: code-reviewer subagent (2026-10-06). Kết luận: DONE, 0 Critical/High/Medium, 8 Low.

## Tiêu chí chấp nhận
Đạt đủ: 8 huy hiệu, rule SQL tham số hoá trên truyện công khai + tác giả không bị ban, follower đã xác thực + không bị ban, không thu hồi, mỗi badge một `INSERT … SELECT … ON CONFLICT DO NOTHING` tự commit, `ensureBadgeCatalog` trước mỗi lần trao + lúc boot, scheduler 30 phút queue `maintenance`, trang tác giả hiện huy hiệu theo thứ tự danh mục, không migration, không thông báo. HTML cache công khai chỉ chứa `{code, awardedAt}`.

## Contract
- `AuthorPageData.badges` thêm (additive). `/api/v1/stories?list=author` không đổi.
- Export mới: core `ensureBadgeCatalog`, `awardMilestoneBadges`, `badgeRuleQuery`, `listUserBadges`, `UserBadgeDto`; shared `BADGES`, `BADGE_CODES`, `BadgeCode`, `BadgeDefinition`, `BadgeRule`, `isBadgeCode`; `MAINTENANCE_JOBS.awardBadges`.
- Deploy: worker cũ còn chạy lúc scheduler mới đăng ký thì fail một lần `award-badges` (UnrecoverableError), lần sau tự đúng.

## Low và xử lý
1. `getAuthorPage` gọi `listUserBadges` cả ở đường `lists.ts` (bỏ kết quả) — [auto] giữ: một query theo PK, rẻ; tách option làm type phức tạp hơn.
2. Rule followers viết tên bảng/cột cứng — **đã sửa**: Drizzle ref + `alias(users, 'follower')`.
3. Rule followers không đòi tác giả còn truyện công khai — giữ theo bảng plan; trang tác giả 404 nên không hiện.
4. Huy hiệu tính cả truyện 18+ (`includeMature: true`) hiện trên trang tác giả công khai — [auto] giữ theo plan; câu hỏi mở cho user.
5. Upsert catalog ghi lại 8 dòng mỗi 30 phút — giữ, vô hại.
6. Export `badgeRuleQuery`/`listUserBadges` khỏi barrel chưa dùng ngoài core — giữ.
7. Regex test `BadgeList` phụ thuộc thứ tự svg/text — giữ.
8. `awardedAt` gửi về client chưa render — giữ theo checklist plan.
