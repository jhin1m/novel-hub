# Red team: Assumption Destroyer + Scope Auditor, plan Giai đoạn 2 (2026-10-06)

Mọi claim kiểm bằng grep/read trên code hiện tại. Đã xác nhận đúng (không phải finding): `follow_target` = story/user; `canEditStory` chỉ chủ truyện (`policies/story.ts:10-12`); `chapter_count` chỉ đếm chương published, chưa xoá mềm (`publishing/counters.ts:10-19`); `reports.target_id` uuid (`schema/moderation.ts:13`); `publicStoryWhere` cần join users (`catalog/story-card.ts:101-107`); `reading_progress` chỉ có cho user đăng nhập; `CurrentUser.status` có trong session, cookieCache tắt (`auth/src/auth.ts:115`, `auth/src/current-user.ts:45`); `truncateAll` quét động mọi bảng public.

## Finding 1: Từ vựng nhật ký mod không mở rộng được như plan giả định
- **Severity:** High
- **Location:** Phase 8 "Requirements" (`feature_story`/`unfeature_story`); Phase 9 "Requirements" (target `contest`, `create_contest`/`update_contest`/`set_contest_placement`); Phase 1 và 4 "Function / Interface Checklist" (`ModerationTarget {type:'comment'|'rating'}`); plan.md "Kiểm duyệt"
- **Flaw:** Plan cho rằng chỉ cần gọi `logModerationAction` là ghi được action/target tuỳ ý. Thực tế cả hai đều là union đóng: `action: ModerationAction` lấy từ `MODERATION_ACTIONS`, và mảng này **chính là** tập action của body `POST /moderation/actions`. Một test khẳng định quan hệ 1:1 đó. `ModerationTarget.type` chỉ có `story|chapter|user|tag|report`. Không phase nào liệt kê `log-action.ts`. Phase 8/9 cũng không liệt kê `schemas/reports.ts`.
- **Failure scenario:** Cook phase 8 thêm `feature_story` vào `MODERATION_ACTIONS` để qua typecheck. Khi đó test `reports.test.ts:58` đỏ, `ACTION_LABELS: Record<ModerationAction,…>` thiếu key và lỗi type, và `dispatch` có nhánh `never` (`apply-action.ts:52-55`) buộc phải có case. Cách "sửa" dễ nhất là cho thêm `feature_story`/`create_contest` vào union của `POST /moderation/actions`, tức là mở một đường thứ hai không có validate riêng. Phase 9 còn vỡ type ở `{type:'contest'}`.
- **Evidence:** `packages/core/src/moderation/log-action.ts:8-11,14-19`; `packages/shared/src/schemas/reports.ts:27-41,92-108`; `packages/shared/src/schemas/reports.test.ts:43-58`; `apps/web/src/components/moderation/report-actions.ts:5-17`; `packages/core/src/moderation/apply-action.ts:12-56`
- **Suggested fix:** Phase 1 tách `MODERATION_LOG_ACTIONS` (superset, chỉ để ghi log) khỏi `MODERATION_ACTIONS` (one-click từ hàng chờ), và mở rộng `ModerationTarget.type` thêm `comment|rating|contest`. Ghi `log-action.ts` + `schemas/reports.ts` vào Related Code Files của phase 1, 4, 8, 9.

## Finding 2: Mod tự kiểm duyệt bình luận/review của chính mình, và mod đè lên admin
- **Severity:** High
- **Location:** Phase 1 "Implementation Steps" bước 4 (`setCommentHidden`); Phase 4 bước 4 (`setRatingHidden`)
- **Flaw:** Hành động trên truyện/chương của Gđ1 có hai guard. (a) `lockStory` gọi `canModerateUser(actor, author)`: không ai tự xử nội dung của mình, mod không đụng nội dung của mod/admin. (b) `targetOwnerId`/`isOwnReport` chặn mod đóng báo cáo về chính mình. `targetOwnerId` chỉ biết `user|story|chapter`, loại khác trả `null`. Plan không nhắc guard nào trong hai guard này cho comment/rating, và không liệt kê `resolve-reports.ts`.
- **Failure scenario:** Mod A viết bình luận lăng mạ và bị báo cáo. A tự `dismiss_report` (vì `isOwnReport` ra false), hoặc mod khác ẩn rồi A tự `restore_comment`. Mod cũng ẩn được review của admin.
- **Evidence:** `packages/core/src/moderation/resolve-reports.ts:8-26,67-74`; `packages/core/src/moderation/content-visibility.ts:12-38`; `packages/core/src/policies/moderation.ts:12-27`
- **Suggested fix:** Mở rộng `targetOwnerId` với `comment` (`comments.user_id`) và `rating` (`ratings.user_id`). Trong `setCommentHidden`/`setRatingHidden`, khoá dòng rồi kiểm `canModerateUser(actor, {id: author, role})`. Thêm int test "mod tự xử nội dung của mình → FORBIDDEN".

## Finding 3: `stories.rating_count/rating_sum` làm hỏng `updated_at`, gây tranh khoá, và lệch spec về ban
- **Severity:** High
- **Location:** Phase 4 "Key Insights" (dòng 26), "Architecture" (dòng 54, 58), bước 3 lưu ý (dòng 93)
- **Flaw:** Cột `updatedAt` có `$onUpdate`. Mọi `tx.update(stories).set({ratingCount…})` qua Drizzle đều bump `stories.updated_at`. Cột này nuôi sitemap `lastmod`, thứ tự danh sách "Truyện của tôi" và nhãn "Cập nhật …" ở `/write`. Thêm vào đó, mỗi lượt đánh giá khoá `stories FOR UPDATE`, chung khoá với publish (`recomputeStoryCounters` yêu cầu story đã khoá). Bản thân plan cũng thừa nhận tổng lấy từ cột vẫn tính đánh giá của user bị ban, trong khi spec §7 nói user bị ban thì "nội dung bị ẩn".
- **Failure scenario:** Người đọc chấm sao một truyện cũ. Sitemap báo truyện "vừa sửa" nên bot crawl lại, truyện nhảy lên đầu `/write` của tác giả với "Cập nhật vừa xong" dù tác giả không làm gì. Một tài khoản spam 1 sao bị ban vẫn kéo điểm trung bình xuống mãi mãi.
- **Evidence:** `packages/db/src/schema/columns.ts:15-19`; `packages/core/src/seo/sitemap.ts:122,134`; `packages/core/src/stories/read-stories.ts:30`; `apps/web/src/components/write/my-story-card.tsx:60`; `packages/core/src/publishing/counters.ts:4-8`
- **Suggested fix:** Bỏ hai cột denormalized. Plan tự ghi "không phase nào cần" (YAGNI), và đằng nào cũng đã có `GROUP BY score` lọc visible + người viết không ban (5 dòng, có index `story_id`). Lấy count/sum từ chính query đó là đúng spec và không cần `FOR UPDATE`. Nếu vẫn muốn giữ cột thì đặt ở bảng riêng `story_rating_totals` (khoá chính `story_id`), không đặt trên `stories`.

## Finding 4: Thông báo huy hiệu không hiện trên chuông
- **Severity:** High
- **Location:** Phase 3 "Requirements" (dòng 40-41: danh sách và unread-count chỉ tính mục "còn hiển thị được", lọc theo chương đọc được); Phase 7 "Related Code Files" (dòng 82: chỉ sửa `list-notifications.ts`)
- **Flaw:** Phase 3 định nghĩa "hiển thị được" bằng cách join chương lấy từ payload. Mục `badge_awarded` không có chương. Phase 7 chỉ sửa danh sách, không sửa `unread-count.ts`, nên một inner join hoặc điều kiện "chương đọc được" sẽ loại mọi thông báo huy hiệu khỏi badge số. Bảng `notifications` chỉ có `type` + `payload` jsonb, không có cột chương.
- **Failure scenario:** Tác giả nhận `chapters_10`. Chuông vẫn hiện 0. Thông báo chỉ thấy được nếu tự mở `/notifications`. Int test của phase 7 không phát hiện vì không kiểm unread-count.
- **Evidence:** `packages/db/src/schema/community.ts:83-100`; plan `phase-03-theo-doi-va-thong-bao.md:41,80`; `phase-07-huy-hieu-va-cot-moc.md:82`
- **Suggested fix:** Phase 3 dựng điều kiện hiển thị theo `type` (`chapter_published` → chương đọc được; type khác → luôn hiện), đặt trong một helper SQL mà list và count dùng chung. Phase 7 thêm `unread-count.ts` và test "badge chưa đọc → count = 1".

## Finding 5: Wiring Redis cho xếp hạng ở API chưa được xác định, và thiếu nơi khởi tạo
- **Severity:** Medium
- **Location:** Phase 5 "Related Code Files" (dòng 91: "`deps.ts`/`testing.ts` nếu cần thêm `rankingStore`"), "Dependency Map" (dòng 133: `getInfra().redis`)
- **Flaw:** `listStories(db, query, o)` chỉ nhận `db`. `createStoryRoutes` lấy `Pick<ApiDeps,'auth'|'db'|'storage'|'rateLimit'|'clientIp'>`. `ApiDeps` không có Redis thô. `Infra` không có field `redis`, chỉ có `producerRedis` (không offline queue). `ApiDeps` được khởi tạo ở `apps/web/src/server/api-app.ts`, nhưng file này không có trong plan. Phần "Redis lỗi/timeout → rỗng" cũng chưa có timeout. Rate limit phải dùng `RATE_LIMIT_TIMEOUT_MS` chính vì Redis treo, khác với Redis chết.
- **Failure scenario:** Cook truyền `producerRedis` thẳng vào route, phá ranh giới port của `ApiDeps`, hoặc thêm field nhưng quên `api-app.ts`. Trong trường hợp quên, production chạy với `null` nên `GET /stories?list=ranking` luôn rỗng mà int test vẫn xanh (`makeTestApiDeps` để default null). Redis treo thì SSR `/rankings` cũng treo theo.
- **Evidence:** `packages/core/src/catalog/lists.ts:20-24`; `packages/api/src/routes/stories.ts:28-40`; `packages/api/src/deps.ts:23-41`; `packages/api/src/testing.ts:21-37`; `apps/web/src/server/api-app.ts:26-56`; `apps/web/src/server/infra.ts:63-71,84,123-128`
- **Suggested fix:** Định nghĩa port `RankingReader` trong core (`createRankingReader(redis, prefix, timeoutMs)`, theo mẫu `createViewCounter`). Tạo một lần trong `infra.ts`, thêm `rankings: RankingReader | null` vào `ApiDeps` và `makeTestApiDeps`, truyền ở `api-app.ts`. Server-fn SSR dùng cùng instance. `listStories` nhận reader qua `o`.

## Finding 6: Ba job định kỳ nặng bị nhét vào queue `publishing` vốn nhạy độ trễ
- **Severity:** Medium
- **Location:** plan.md "Outbox và hàng đợi"; Phase 3 (prune-notifications), Phase 5 (recompute-rankings), Phase 7 (award-badges, dòng 52, 60)
- **Flaw:** Worker `publishing` chạy concurrency 2, kèm chú thích rằng hai slot là "để sweep dài không làm trễ drain". Drain outbox chạy mỗi 5 giây, sweeper hẹn giờ mỗi 60 giây. Plan thêm vào đó 4 query GROUP BY trên 30 + 14 ngày `chapter_daily_stats`, 8 câu INSERT…SELECT trong một transaction, và một DELETE hàng loạt.
- **Failure scenario:** `recompute-rankings` và `award-badges` chạy cùng lúc và chiếm cả hai slot. Drain outbox và sweeper phải chờ, nên chương hẹn giờ đăng muộn, purge CDN và thông báo chương mới cũng muộn theo. Lần chạy đầu trên production (trao hàng loạt huy hiệu) là lúc dễ xảy ra nhất.
- **Evidence:** `apps/worker/src/publishing-worker.ts:21-28,44-56,76-88`
- **Suggested fix:** Tạo queue riêng `maintenance` (concurrency 1) cho rankings, badges, prune. Hoặc ít nhất ghi rõ là tăng concurrency và đo thời gian chạy trong int test. Không để job thống kê dùng chung slot với drain/sweep.

## Finding 7: Điểm xếp hạng bơm được, vì giới hạn chống bơm tính theo chương chứ không theo truyện
- **Severity:** Medium
- **Location:** Phase 5 "Key Insights" (dòng 24), "Requirements" (dòng 34-38), plan.md "Xếp hạng"
- **Flaw:** Plan đọc `VIEW_RULES` thành "3 lượt/viewer/ngày, 10/IP/ngày". Thực tế cả hai giới hạn đều tính **mỗi chương** mỗi ngày. Điểm truyện = tổng `unique_readers` qua mọi chương, nên trần bơm tăng tuyến tính theo số chương. Spec §6 dựa vào giới hạn theo user/IP để chống bơm. Plan gộp theo truyện nhưng lại không có giới hạn theo truyện.
- **Failure scenario:** Một truyện 200 chương, một IP, bot headless xoay cookie `nh_vid` và để trang mở ≥ 30 giây: tối đa 10 × 200 = 2.000 điểm mỗi ngày. Truyện thật có 500 người đọc chương mới chỉ được 500 điểm. `rising` (ngưỡng 20) bị chiếm chỉ bằng vài IP. Ngay cả không có bot, bảng vẫn thiên về truyện dài có người đọc cày.
- **Evidence:** `packages/shared/src/views.ts:8-11`; `packages/core/src/views/view-counter.ts:40-47` (HLL `uv` theo chương)
- **Suggested fix:** Trong cùng Lua, PFADD thêm một HLL theo truyện/ngày (`suv:{date}:{storyId}`). Worker flush thêm `story_daily_stats(story_id, date, unique_readers)` và xếp hạng tính trên số người đọc truyện duy nhất. Nếu giữ phương án hiện tại thì phải sửa Key Insights cho đúng và ghi rủi ro bơm có định lượng để user duyệt.

## Finding 8: Đếm bình luận theo đoạn tạo một request origin cho mỗi lượt đọc chương
- **Severity:** Medium
- **Location:** Phase 2 "Requirements" (dòng 38: tải sau lần cuộn đầu tiên hoặc 5 giây)
- **Flaw:** Mâu thuẫn trực tiếp với quyết định "Tải lười" ở plan.md:48 (lý do được nêu: "để lượt đọc chương không kéo request về origin"). Hầu như mọi người đọc đều cuộn hoặc ở lại quá 5 giây. Mọi `/api/*` đều bị `noStore`, mỗi request còn chạy `sessionMiddleware` (đọc DB) và một GROUP BY.
- **Failure scenario:** 100k lượt đọc chương/ngày cho ra 100k request không cache về origin, đúng tải mà phase 1 cố tránh. Lượng này gấp vài lần request `reading/view` (chỉ gửi sau 30 giây).
- **Evidence:** `packages/api/src/app.ts:36` (`noStore` cho mọi `/api`); `apps/web/src/lib/cache-headers.ts:28`; plan `plan.md:48`, `phase-02-binh-luan-theo-doan.md:38`
- **Suggested fix:** Số đếm theo đoạn không phụ thuộc người xem, nên cho endpoint này (hoặc file JSON tĩnh theo chương) `Cache-Control: public, s-maxage=60` và bỏ qua session. Cách khác: chỉ tải số đếm khi người đọc bật "Hiện bình luận đoạn" hoặc khi chạm vào một đoạn.

## Finding 9: `/rankings/*` và `/contests/*` không purge, phá invariant purge danh sách của Gđ1
- **Severity:** Medium
- **Location:** Phase 5 "Non-functional" (dòng 47), Phase 9 "Non-functional" (dòng 46), plan.md:56
- **Flaw:** `catalogUrls` được viết với invariant: mọi trang danh sách cache mà truyện vừa bị ẩn hoặc tác giả vừa bị ban phải biến mất khỏi đều được purge. `LIST_CACHE` có `stale-while-revalidate=3600`. Plan để bảng xếp hạng và trang cuộc thi ngoài cơ chế này. Truyện bị ẩn vì bản quyền hay nội dung cấm lại chính là truyện hay nằm top.
- **Failure scenario:** Mod ẩn truyện vi phạm đang top 1 tuần. Trang chủ được purge, nhưng `/rankings/week` vẫn hiện bìa, tên truyện và tên tác giả tới khoảng 10 phút + SWR. Với trang cuộc thi, tác giả bị ban vẫn hiện trong "Kết quả".
- **Evidence:** `packages/core/src/catalog/urls.ts:9-31`; `apps/web/src/lib/cache-headers.ts:11-18`
- **Suggested fix:** Trong `catalogUrls` (case story/chapter/user) thêm 4 path xếp hạng, việc này rẻ. Phase 9 thêm `/contests` + `/contests/{slug}` của các cuộc thi mà truyện đang dự thi.

## Finding 10: Fan-out theo từng chương làm ngập thông báo khi tác giả đăng loạt
- **Severity:** Medium
- **Location:** Phase 3 "Requirements" (dòng 38: "mỗi người tối đa một thông báo mỗi chương"), "Non-functional" (dòng 46)
- **Flaw:** Mỗi chương đăng lần đầu phát ra một change `chapter/published`. Sweeper đăng mọi chương đến hạn trong một lượt. Dedupe theo `chapter:{id}`, không gộp theo truyện. Trên nền tảng mới, tác giả thường chuyển truyện cũ sang bằng cách hẹn giờ hoặc đăng liền hàng chục chương.
- **Failure scenario:** Tác giả đăng liền 30 chương. Mỗi follower nhận 30 thông báo, chuông hiện "30", trang `/notifications` chỉ toàn một truyện. Follower bỏ theo dõi, đi ngược mục tiêu §1 "tác giả thấy có người đọc".
- **Evidence:** `packages/core/src/publishing/changes.ts:13-29`; `packages/core/src/publishing/publish-chapter.ts:47,65-71`
- **Suggested fix:** Đổi dedupe key thành gộp theo truyện + người nhận khi còn mục chưa đọc. Ví dụ: `ON CONFLICT` trên partial unique `(user_id, story_id) where read_at is null and type='chapter_published'` thì `DO UPDATE` payload `{latestChapterId, count}`. Cách khác: hiển thị gộp "{Truyện} có N chương mới" ngay ở query danh sách và count.

## Câu hỏi chưa giải quyết
- Phase 8 tự sửa câu hero ở spec §8 (nguồn chuẩn) theo kiểu `[auto]`. CLAUDE.md yêu cầu hỏi khi gặp mâu thuẫn với spec. Cần user duyệt trước khi cook.
- Phase 1, 4, 8, 9 dùng mã lỗi core `STORY_NOT_FOUND`, `CHAPTER_NOT_FOUND`, `VALIDATION`, `EMAIL_NOT_VERIFIED`, nhưng chưa có trong `CORE_ERROR_STATUS` (`packages/api/src/lib/core-errors.ts:5-26`), và quy ước hiện tại là dùng `NOT_FOUND` chung. Chọn dùng lại `NOT_FOUND`, hay liệt kê rõ các mã mới?
- Phase 6 thêm `follows_target_created_idx (target_type, target_id, created_at)` nhưng không xoá `follows_target_idx (target_type, target_id)`, nên index cũ thành thừa.
