---
title: "Giai đoạn 2: Cộng đồng"
description: "6 checkbox Giai đoạn 2 của spec trong 9 phase: bình luận chương và theo đoạn, theo dõi + thông báo, đánh giá, xếp hạng, dashboard tác giả, huy hiệu, truyện nổi bật do mod chọn, cuộc thi theo chủ đề."
status: pending
priority: P1
effort: 13d
branch: "overnight/261006"
tags: [frontend, backend, worker, community, moderation]
blockedBy: []
blocks: []
created: "2026-10-06T02:17:42.664Z"
createdBy: "ck:plan"
source: skill
---

# Giai đoạn 2: Cộng đồng

## Overview

Giai đoạn 0 và 1 xong (trừ 2 checkbox hạ tầng của Gđ1: S3 MinIO thật, backup offsite trên VPS; user duyệt cho sang Gđ2, hai checkbox giữ `[ ]`). Redesign B+ xong (`plans/261006-0116-ui-redesign-b-plus`): UI mới theo `docs/design-guidelines.md` và spec §8. Spec `docs/project-spec.md` là nguồn chuẩn.

Schema đã có sẵn `comments`, `follows`, `ratings`, `notifications`, `badges`, `user_badges`, `featured_slots`, `chapter_daily_stats`; gần như chưa có logic. Thiếu: bảng cuộc thi, kiểm tra `muted`, target báo cáo `comment`, code xếp hạng, job thông báo (scout: `reports/scout-261006-0225-backend-report.md`, `reports/scout-261006-0225-frontend-tests-report.md`).

Mỗi lần `/ck:cook` đúng một phase; checkbox spec chỉ đánh `[x]` ở phase cuối của nó.

## Phases

| Phase | Name | Checkbox spec | Status |
|-------|------|---------------|--------|
| 1 | [Bình luận chương hai cấp](./phase-01-binh-luan-chuong-hai-cap.md) | 1 (phần 1/2) | Pending |
| 2 | [Bình luận theo đoạn](./phase-02-binh-luan-theo-doan.md) | 1 (đánh `[x]`) | Pending |
| 3 | [Theo dõi và thông báo](./phase-03-theo-doi-va-thong-bao.md) | 2 | Pending |
| 4 | [Đánh giá và review](./phase-04-danh-gia-va-review.md) | 3 | Pending |
| 5 | [Xếp hạng](./phase-05-xep-hang.md) | 4 | Pending |
| 6 | [Dashboard tác giả](./phase-06-dashboard-tac-gia.md) | 5 | Pending |
| 7 | [Huy hiệu và cột mốc](./phase-07-huy-hieu-va-cot-moc.md) | 6 (phần 1/3) | Pending |
| 8 | [Truyện nổi bật do mod chọn](./phase-08-truyen-noi-bat-do-mod-chon.md) | 6 (phần 2/3) | Pending |
| 9 | [Cuộc thi theo chủ đề](./phase-09-cuoc-thi-theo-chu-de.md) | 6 (đánh `[x]`) | Pending |

Phụ thuộc tuyến tính 1 → 9. Cứng: 2 cần 1; 4 dùng policy cộng đồng, `normalizePlainText`, `MODERATION_LOG_ACTIONS` của 1; 5 và 7 dùng queue `maintenance` của 3; 6 dùng `follows` của 3 và `story_daily_stats` của 5; 7 dùng `follows` của 3; 8, 9 dùng từ vựng log của 1; 9 dùng `vn-datetime` của 8.

## Quyết định đã chốt

Tag `[auto]` = tự chọn khi user ngủ (phương án Recommended hoặc đơn giản nhất), sáng cần duyệt.

- [auto] **Tách phase:** controller dặn "mỗi checkbox một phase"; checkbox 1 ("…, sau đó bình luận theo đoạn") và checkbox 6 (ba tính năng tách bằng `;`) tách thành 2 và 3 phase như tiền lệ Gđ1 (tách checkbox 6, 11). Lý do: mỗi worker cook một context sạch, phase quá lớn dễ vỡ gate.
- **Kiến trúc dữ liệu cho UI (giữ nguyên Gđ1):** HTML công khai không phụ thuộc cookie và giống hệt mọi người. Bình luận, đánh giá, trạng thái theo dõi, thông báo tải ở client qua Hono `/api/v1/*` + `hc` + TanStack Query, `no-store`; key cá nhân đặt dưới `meQueryKey`. Chép mẫu `LibraryButton` (nút trung tính khi SSR/`me` pending, link đăng nhập cho khách).
- [auto] **Tải lười:** khu bình luận cuối chương và khu đánh giá ở trang truyện chỉ gọi API khi cuộn tới gần (IntersectionObserver, `rootMargin` ~600px), để lượt đọc chương không kéo request về origin. Lý do: trang đọc là phần lớn traffic, spec §6 muốn origin chỉ gánh request động.
- **Policy cộng đồng:** một hàm `canPostCommunityContent(user)` ở `core/policies/community.ts` = email đã xác thực **và** `status = 'active'` (muted không đăng bình luận, spec §7). Dùng cho bình luận (phase 1–2) và đánh giá/review (phase 4) [auto: muted cũng không đánh giá được, review là nội dung cộng đồng như bình luận]. Theo dõi chỉ cần đăng nhập.
- **Mã lỗi** (Red Team): theo quy ước hiện có dùng lại `NOT_FOUND`, `FORBIDDEN`, `INVALID_STATE` (`packages/api/src/lib/core-errors.ts`); mã mới chỉ khi UI cần phân biệt: `USER_MUTED`, `COMMENT_PARAGRAPH_INVALID`, `RATING_HIDDEN`, `FEATURED_MATURE`, `CONTEST_NOT_OPEN`, `CONTEST_STORY_INELIGIBLE`, `CONTEST_PLACEMENT_TAKEN`.
- **Ban:** giữ một cơ chế của Gđ1 — mọi danh sách công khai lọc `users.status <> 'banned'` (bình luận, review, xếp hạng, nổi bật, cuộc thi). Không xoá dữ liệu.
- **Kiểm duyệt:** target báo cáo thêm `{type:'comment', commentId}` (phase 1) và `{type:'rating', ratingId}` (phase 4) — UUID ở đây là ngoại lệ có chủ đích của quy tắc "báo cáo chỉ dùng khoá công khai" vì hai loại này không có khoá công khai; action one-click `hide_comment`/`restore_comment`, `hide_rating`/`restore_rating` đi qua `applyModerationAction`. Phase 1 tách `MODERATION_LOG_ACTIONS` (superset chỉ-ghi-log cho `logModerationAction`) khỏi `MODERATION_ACTIONS` (body `POST /moderation/actions`); truyện nổi bật (phase 8) và cuộc thi (phase 9) thêm action chỉ-ghi-log. Guard như Gđ1: `canModerateUser` (không tự xử nội dung của mình, mod không xử mod/admin) và `targetOwnerId` mở rộng cho comment/rating; mod không chọn nổi bật/xếp hạng cuộc thi cho truyện của mình.
- [auto] **Bình luận:** văn bản thuần (≤ 2.000 ký tự, chuẩn NFC, render như text, không linkify); không sửa, chỉ tự xoá mềm (`status = 'deleted'`); trả lời chỉ gắn vào bình luận gốc (trả lời một trả lời → gắn vào gốc của nó); gốc bị xoá/ẩn thì ẩn cả nhánh. Gốc mới nhất trước, trả lời cũ nhất trước. Không thông báo khi có trả lời (spec chỉ yêu cầu thông báo chương mới).
- [auto] **Bình luận theo đoạn** (Red Team: spec §8 "Không chèn gì vào giữa nội dung"): không chèn node nào vào HTML chương. Bôi chọn chữ trong một phần tử `[data-pid]` (đoạn hoặc heading) → nút nổi ngoài nội dung mở sheet luồng đoạn; khu bình luận cuối chương có tab "Theo đoạn" liệt kê đoạn có bình luận. Đếm theo đoạn tải cùng khu bình luận (lười), bằng `GROUP BY`. Danh sách chương gồm bình luận không gắn đoạn **và** bình luận có pid không còn trong `paragraph_ids` (đoạn đã sửa). Chỉ báo trong nội dung kiểu 段评 là câu hỏi mở cho user.
- [auto] **Thông báo:** fan-out-on-write bằng một câu `INSERT … SELECT … ON CONFLICT … DO UPDATE` từ `follows` (truyện ∪ tác giả, trừ chính tác giả); **gộp theo truyện**: mỗi người tối đa một thông báo chưa đọc mỗi truyện (`dedupe_key = 'story:{id}'`, unique partial `where read_at is null`), chương mới tăng `count`; payload chỉ lưu id. Một điều kiện hiển thị `notificationVisibleWhere` dùng chung cho danh sách và đếm chưa đọc (chương còn đọc được, truyện 18+ ẩn với người chưa bật). Đếm bằng SQL + partial index, không Redis. Chuông poll 60 giây + khi focus tab. Xoá thông báo > 90 ngày theo lô.
- [auto] **Đánh giá** (Red Team): không cột tổng trên `stories` (cột `updated_at` tự bump, tổng lệch khi ban); summary + phân bố bằng một `GROUP BY score` trên đánh giá `visible` của người không bị ban. Tác giả không tự đánh giá. Đánh giá đang bị mod ẩn không sửa/xoá được (`RATING_HIDDEN`), để không hồi sinh bằng xoá + đăng lại. Điểm hiện ở khu đánh giá (tải client), không vào HTML SSR.
- [auto] **Xếp hạng** (Red Team: chống bơm): đếm thêm **người đọc duy nhất theo truyện mỗi ngày** (HLL Redis cạnh bộ đếm chương, giới hạn 10 người/IP/truyện/ngày) → bảng mới `story_daily_stats`. Điểm = tổng `story_daily_stats.unique_readers` trong cửa sổ ngày `Asia/Ho_Chi_Minh`: ngày = hôm nay + hôm qua, tuần = 7 ngày, tháng = 30 ngày; tăng trưởng = (7 ngày gần nhất − 7 ngày trước) / max(7 ngày trước, 20), chỉ xét truyện ≥ 20. Worker tính lại mỗi 15 phút (queue `maintenance`), ghi Redis sorted set (`general` không 18+ / `all`) qua key tạm + `RENAME`, rỗng thì xoá key. Đọc qua port `RankingReader` (timeout) trong `ApiDeps`. URL `/rankings/{day|week|month|rising}`, cache danh sách 10 phút, purge qua `catalogUrls`. Không thêm khu trên trang chủ; lối vào ở header desktop + footer.
- [auto] **Dashboard** (Red Team: thu gọn): trang theo truyện `/write/stories/{publicId}/stats`, cửa sổ cố định 30 ngày, 4 ô tổng + bảng theo chương có thanh % bằng CSS (không biểu đồ SVG, không migration). Tỷ lệ bỏ dở tính từ `reading_progress` (chỉ người đọc đã đăng nhập, chương mới nhất mỗi người) — xấp xỉ, ghi rõ trên trang.
- [auto] **Huy hiệu:** 8 huy hiệu cột mốc tác giả (chương đầu tiên, 10/100 chương, 100.000/1.000.000 chữ, 10/100 người theo dõi tác giả đã xác thực email và không bị ban, hoàn thành một truyện). Danh mục là hằng ở `packages/shared`, upsert vào bảng `badges` khi worker khởi động và đầu mỗi lần trao; job 30 phút (queue `maintenance`) trao bằng SQL tập hợp `ON CONFLICT DO NOTHING`. Không thông báo huy hiệu, không huy hiệu người đọc ở năm đầu.
- [auto] **Truyện nổi bật** (Red Team: không đảo quyết định hero vừa chốt ở `6868c85`): một slot `home_picks` — khu "Truyện nổi bật" (tối đa 12) dưới hàng hero; hero giữ "Mới đáng chú ý" tự động, spec §8 không đổi. Không cho chọn truyện 18+ hoặc truyện của chính mod. Không purge riêng (trang chủ cache 10 phút; truyện bị ẩn/ban vẫn được purge qua `catalogUrls`).
- [auto] **Cuộc thi:** bảng `contests` + `contest_entries` (tác giả chủ động tham gia, không suy ra từ tag); truyện hợp lệ = của mình, đã đăng, không 18+, tạo sau `starts_at`; tham gia/rút khi cuộc thi đang mở; mod tạo/sửa cuộc thi và gán hạng 1–3 sau khi kết thúc. Không bình chọn, không giải thưởng tiền, không chip dự thi trên trang truyện. URL `/contests`, `/contests/{slug}`; purge qua `catalogUrls`.
- **Outbox và hàng đợi:** job nội dung mới `notify-followers` map từ change `chapter/published` trong `jobsForChange`. Job định kỳ nặng chạy trên **queue mới `maintenance`** (concurrency 1, tạo ở phase 3) để không chiếm 2 slot của `publishing` (drain outbox 5 s, sweeper 60 s): `prune-notifications` (1 ngày), `recompute-rankings` (15 phút), `award-badges` (30 phút). Mọi processor idempotent. Test cố định danh sách scheduler/bảng (`publishing-worker.int.test.ts`, `packages/db/src/schema.int.test.ts`) phải sửa trong phase thay đổi chúng.
- **E2E không chạy worker** (`apps/web/playwright.config.ts`): spec nào cần kết quả job thì helper gọi thẳng hàm core (như `syncSearch`).

## Dependency mới

Không có. Không biểu đồ/thư viện chart; không thêm component shadcn (radio chọn sao dùng `<input type="radio">` thường).

## Thay đổi config/env

- Không đổi Docker, env, CI. Worker thêm queue BullMQ `maintenance` (code, cùng Redis, không đổi config).
- Migration mới (sinh bằng `pnpm db:generate`, không sửa migration đã chạy): `0003` luồng bình luận (phase 1), `0004` index bình luận theo đoạn (phase 2), `0005` gộp thông báo + index chưa đọc (phase 3), `0006` đánh giá: `id`, `status`, `updated_at` (phase 4), `0007` bảng `story_daily_stats` (phase 5), `0008` cuộc thi (phase 9). Số thứ tự thực tế do drizzle-kit gán; phase nào không đổi schema thì không có migration.
- Tài liệu: `docs/code-standards.md` (bảng URL mục 3: `/notifications`, `/rankings/{period}`, `/write/stories/{publicId}/stats`, `/contests`, `/contests/{slug}`), `docs/moderation-guide.md` (bình luận, review, truyện nổi bật, cuộc thi), `CLAUDE.md` nếu thêm lệnh.

## Ngoài phạm vi

- Sửa bình luận, thả tim/vote bình luận, vote "hữu ích" cho review, @mention có thông báo, thông báo trả lời bình luận.
- Danh sách "Đang theo dõi" riêng, số người theo dõi công khai, email/push thông báo, SSE/websocket.
- Huy hiệu người đọc, bảng thành tích riêng; bình chọn cuộc thi, giải thưởng; dashboard cấp tài khoản nhiều truyện.
- Ghi `chapter_daily_stats.completions` (chưa nguồn nào ghi; không phase nào cần).
- Khu xếp hạng trên trang chủ, hero do mod chọn, thông báo huy hiệu, biểu đồ dashboard, khoảng 7/90 ngày, chip dự thi (Red Team: cắt).
- Gửi bù thông báo khi chương/truyện được khôi phục sau khi job đã bỏ qua (Red Team: từ chối, hiếm).

## Success Criteria

- [ ] 6 checkbox Giai đoạn 2 trong spec được đánh `[x]`
- [ ] Mỗi phase xanh gate `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm test:int && pnpm test:e2e`
- [ ] Trang đọc, trang truyện, trang tác giả vẫn trả `Cache-Control: public, …`, không `Set-Cookie`, HTML không chứa dữ liệu cá nhân hay bình luận
- [ ] Mọi danh sách công khai mới (xếp hạng, nổi bật, cuộc thi) không chứa truyện 18+ trong HTML SSR, không chứa nội dung của tài khoản bị ban
- [ ] Muted không đăng được bình luận/đánh giá; mod ẩn/khôi phục được bình luận và review từ hàng chờ, không tự xử nội dung của mình
- [ ] Không node nào được chèn vào HTML nội dung chương (spec §8)

## Research

- [Bình luận, theo dõi, thông báo, đánh giá](./research/researcher-01-comments-follows-notifications-ratings.md)
- [Xếp hạng, dashboard tác giả](./research/researcher-02-rankings-author-dashboard.md)
- [Huy hiệu, truyện nổi bật, cuộc thi](./research/researcher-03-badges-featured-contests.md)
- Scout: [backend](./reports/scout-261006-0225-backend-report.md), [frontend + test](./reports/scout-261006-0225-frontend-tests-report.md)

Research có vài gợi ý không dùng (Redis `KEYS` để đếm theo đoạn, Redis đếm chưa đọc, job tính lại điểm đánh giá, cuộc thi suy ra từ tag): đã thay bằng phương án đơn giản hơn ở trên.

## Câu hỏi mở

Chờ `/ck:plan validate`. Nơi user dễ muốn đổi nhất:
1. Tách phase (9 phase cho 6 checkbox) thay vì đúng một phase mỗi checkbox.
2. Bình luận theo đoạn: chỉ báo số bình luận ngay trong nội dung (kiểu 段评) có được coi là ngoại lệ của spec §8 "Không chèn gì vào giữa nội dung" không? Plan hiện không chèn.
3. Hero trang chủ có nên do mod chọn (đổi spec §8) không? Plan hiện giữ hero tự động, mod chỉ chọn khu "Truyện nổi bật".
4. Cửa sổ xếp hạng (ngày = hôm nay + hôm qua) và chỉ số (người đọc duy nhất theo truyện, 10/IP/truyện/ngày).
5. Danh mục 8 huy hiệu và ngưỡng.

## Red Team Review

### Session — 2026-10-06
**Findings:** 17 sau khi gộp (39 thô từ 4 reviewer: Security Adversary, Failure Mode Analyst, Assumption Destroyer, Scope & Complexity Critic; báo cáo trong `reports/from-code-reviewer-to-planner-red-team-*-plan-review-report.md`). Chế độ tự động: áp dụng mọi finding Accept [auto].
**Severity breakdown:** 10 High, 7 Medium · 16 Accept, 1 Reject (dòng 17 gộp 2 finding bị từ chối)

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `logModerationAction`/`ModerationTarget` là union đóng, gắn 1:1 với body `POST /moderation/actions` → action nổi bật/cuộc thi vỡ typecheck hoặc mở đường ghi thứ hai | High | Accept: `MODERATION_LOG_ACTIONS` | Phase 1, 4, 8, 9 |
| 2 | Mod tự ẩn/khôi phục/đóng báo cáo về bình luận, review của mình; mod đè admin (`targetOwnerId` trả null cho loại mới) | High | Accept | Phase 1, 4, 8, 9 |
| 3 | Cột tổng đánh giá trên `stories` bump `updated_at` (sitemap, `/write`), tranh khoá với publish, giữ điểm của tài khoản bị ban | High | Accept: tính bằng `GROUP BY` | Phase 4, plan |
| 4 | Review bị mod ẩn hồi sinh bằng xoá + đăng lại | High | Accept: `RATING_HIDDEN` | Phase 4 |
| 5 | Thông báo không phải chương (huy hiệu) không vào đếm chưa đọc; list và count lệch | High | Accept: `notificationVisibleWhere` dùng chung; cắt thông báo huy hiệu | Phase 3, 7 |
| 6 | Xếp hạng bơm được: giới hạn view theo chương, điểm cộng qua chương | High | Accept: HLL người đọc theo truyện + `story_daily_stats` | Phase 5, 6 |
| 7 | `/rankings/*`, `/contests/*` không được purge khi ẩn/ban (SWR 1 giờ) | High | Accept: `catalogUrls` | Phase 5, 9 |
| 8 | Bình luận theo đoạn chèn UI vào nội dung (trái spec §8) và gọi API đếm mỗi lượt đọc | High | Accept: chọn chữ + nút nổi + tab "Theo đoạn"; pid heading hợp lệ | Phase 2, plan |
| 9 | Wiring Redis cho xếp hạng ở API chưa rõ (`ApiDeps`, `api-app.ts`, `producerRedis`), ghi bảng rỗng giữ bảng cũ | High | Accept: port `RankingReader`, `DEL` khi rỗng | Phase 5 |
| 10 | Khu xếp hạng trang chủ và hero do mod chọn ngoài spec; sửa spec §8 vừa chốt ở `6868c85` | High | Accept: cắt cả hai, không sửa spec | Phase 5, 8, plan |
| 11 | Job định kỳ nặng chiếm 2 slot queue `publishing` (drain/sweeper trễ); test cố định danh sách scheduler/bảng | Medium | Accept: queue `maintenance`; thêm test vào file list | Phase 3, 5, 7, 9 |
| 12 | Đăng loạt chương làm ngập thông báo | Medium | Accept: gộp theo truyện | Phase 3 |
| 13 | Endpoint replies theo id bỏ qua kiểm tra chương đọc được | Medium | Accept | Phase 1 |
| 14 | Thông báo theo dõi tác giả lộ truyện 18+ cho người chưa bật | Medium | Accept (trong `notificationVisibleWhere`) | Phase 3 |
| 15 | Huy hiệu người theo dõi cày bằng tài khoản chưa xác thực | Medium | Accept: chỉ đếm follower đã xác thực, không bị ban | Phase 7 |
| 16 | Phase 6 thừa (khoảng, biểu đồ SVG, migration index) | Medium | Accept: 30 ngày cố định, bảng + thanh CSS | Phase 6 |
| 17 | Mất thông báo khi chương bị ẩn tạm lúc job chạy rồi khôi phục; tách phase 1/3/9 nhỏ hơn | Medium | Reject: hiếm, ghi rủi ro; controller yêu cầu mỗi checkbox một phase, đã tách thêm 3 | Phase 3 (rủi ro) |

Thêm theo câu hỏi của reviewer: dùng lại mã lỗi `NOT_FOUND`/`FORBIDDEN`/`INVALID_STATE` (plan, mọi phase); `ensureBadgeCatalog` gọi trước khi trao (e2e truncate); `commentId`/`ratingId` là ngoại lệ có ghi chép của quy tắc khoá công khai.

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01 … phase-09 (grep toàn plan theo thuật ngữ cũ)
- Decision deltas checked: 14 (`MODERATION_LOG_ACTIONS`; guard mod; bỏ cột tổng đánh giá; `RATING_HIDDEN`; `notificationVisibleWhere` + gộp theo truyện; bỏ thông báo huy hiệu; `story_daily_stats` + HLL theo truyện; `RankingReader`; purge `catalogUrls`; bình luận đoạn không chèn DOM; một slot `home_picks`, hero/spec giữ nguyên; queue `maintenance`; dashboard 30 ngày; mã lỗi dùng lại `NOT_FOUND`/`FORBIDDEN`/`INVALID_STATE`)
- Stale references reconciled: `rating_count/rating_sum`, `badge_awarded`, `home_hero`, `PUBLISHING_JOBS.*` cho job định kỳ, `getInfra().redis`, `BarChart`/biểu đồ SVG, `useParagraphAnchors`/bong bóng, `follows_target_created_idx`, `COMMENT_NOT_FOUND`/`CHAPTER_NOT_FOUND`/`STORY_NOT_FOUND`/`FOLLOW_SELF`/`CONTEST_NOT_ENDED`…, khu xếp hạng trang chủ, chip dự thi, danh sách migration
- Unresolved contradictions: 0
