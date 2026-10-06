# Red-team review: Failure Mode Analyst / Flow Tracer

Plan: `plans/261006-0216-giai-doan-2-cong-dong/` (plan.md + phase-01..09). Codebase verified by grep and by reading the code, with file:line cited for each claim.

Flow claims checked and confirmed (no finding):
- `markChapterPublished` emits `chapter/published` only when `chapter.status !== 'published'` (`packages/core/src/publishing/publish-chapter.ts:52`, `changes.ts:20`). Hidden chapters cannot be republished (`publish-chapter.ts:100`).
- `jobsForChange` is a pure switch, so adding a job there is safe (`content/hooks.ts:92-112`). The outbox is at-least-once (`content/outbox.ts:57-62`).
- `useNavVisibility` ignores clicks on `a, button, …` (`lib/reader/use-nav-visibility.ts:42`).
- React re-sets `innerHTML` only when the `__html` string changes. On React main, `setProp` compares `lastHtml !== nextHtml`, so the injected anchors survive re-renders.

---

## Finding 1: Mods can moderate their own comments and reviews, and can close reports about them
- **Severity:** High
- **Location:** Phase 1, "Implementation Steps" step 4 (`setCommentHidden`) and "Related Code Files". Phase 4, "Architecture" (`setRatingHidden`).
- **Flaw:** Existing content actions block self-moderation and mod-on-mod moderation through `canModerateUser`. The plan never asks the new comment/rating actions to do the same. The plan also does not touch `resolve-reports.ts`, where `targetOwnerId` only knows `user | story | chapter`. For the new `comment` and `rating` targets it returns `null`, so `isOwnReport` is always false and the self-check in `closeReport` is skipped.
- **Failure scenario:** A mod posts an abusive comment. It gets reported. The same mod either dismisses the report (`dismiss_report`; the `targetOwnerId(...) === actor.id` check gets `null`, so nothing blocks it) or restores the comment after another mod hid it. A mod can also hide an admin's review. All of this is logged as legitimate.
- **Evidence:** `packages/core/src/moderation/resolve-reports.ts:8-26` (`targetOwnerId` returns `null` for unknown types), `:51` and `:68-74` (self-checks depend on it). `packages/core/src/moderation/content-visibility.ts:35` (`canModerateUser` on story/chapter actions). `packages/core/src/policies/moderation.ts:16` (`actor.id === target.id` → false). `log-action.ts:9` (`ModerationTarget.type` lacks `comment`/`rating`). Grep of the plan shows `canModerateUser`, `targetOwnerId` and `resolve-reports` are never mentioned.
- **Suggested fix:** In phase 1 and phase 4, add `resolve-reports.ts` to "Modify". Extend `targetOwnerId` with `comment → comments.user_id` and `rating → ratings.user_id`, and add both to `ModerationTarget.type`. `setCommentHidden`/`setRatingHidden` must load the author's role and call `canModerateUser`. Add int tests: a mod cannot hide/restore their own comment or dismiss a report about it, and a mod cannot hide an admin's review.

## Finding 2: Every chapter view hits uncached origin + Postgres for paragraph counts
- **Severity:** High
- **Location:** Phase 2, "Requirements" (counts load "sau 1 lần cuộn đầu tiên hoặc 5 giây"). plan.md "Tải lười".
- **Flaw:** Phase 1 carefully keeps comment requests away from origin until the reader nears the end of the chapter. Phase 2 undoes that: almost every view (anyone who scrolls once or stays 5 s) fires `GET /comments/paragraph-counts`. The response is the same for everyone, but every Hono response is forced to `no-store` by default, and the plan sets no cache header. The result is one `GROUP BY` join (comments ⋈ users ⋈ chapter_contents) per page view, while the chapter HTML itself is served by the CDN.
- **Failure scenario:** A popular chapter goes viral, or a bot crawls past the CDN. The CDN absorbs the HTML, but N views mean N uncached DB aggregates. Spec §6 ("origin chỉ gánh request động") is broken by the busiest page on the site. The phase-1 e2e check "không request `/api/v1/comments` trước khi cuộn" also becomes timing-dependent once the 5 s timer fires.
- **Evidence:** `packages/api/src/middleware/no-store.ts:7-10` sets `no-store` unless a route sets its own header, and is mounted globally at `packages/api/src/app.ts:36`. `apps/web/src/lib/cache-headers.ts:21-23` already has a short public profile. Phase 2 "Architecture" has no Cache-Control on the counts endpoint.
- **Suggested fix:** Serve paragraph counts with `Cache-Control: public, s-maxage=60` (they are public, cookie-independent and keyed by URL). Add `?v=` only after the reader's own post (bypass), or merge the reader's own post into the count client-side. Alternatively, defer the fetch until the first paragraph tap and show bubbles only near the viewport. State the origin-load budget explicitly in the phase.

## Finding 3: Unread badge count and the notification list will drift once `badge_awarded` lands
- **Severity:** Medium
- **Location:** Phase 3, "Requirements" (`unread-count` counts "mục chưa đọc còn hiển thị được"; list filters unreadable chapters "trong query"). Phase 7, "Related Code Files" (only `list-notifications.ts` changes).
- **Flaw:** Phase 3 defines visibility of a notification by joining the chapter, story and author from `payload->>'chapterId'`. Phase 7 adds a type with no chapter, but changes only the list query, not `unread-count.ts`. With an inner join, badge notifications are never counted (the bell shows 0 while `/notifications` shows an unread badge item). With a left join, unread chapter notifications for hidden content are counted but never listed (the badge stays at N forever, and "đọc từng mục" can never clear it; only `{all:true}` does).
- **Failure scenario:** An author earns 3 badges → the bell stays at 0 → the feature looks broken. Or a chapter is hidden after fan-out → the follower's bell shows "1" and the list is empty.
- **Evidence:** Phase 3 line "`GET /notifications/unread-count` (đếm mục chưa đọc **còn hiển thị được**…)". Phase 7 file table modifies `notifications/list-notifications.ts` only (grep finds no `unread-count` in phase-07). `packages/db/src/schema/community.ts:85-100` (`payload` is untyped jsonb, no FK to chapters).
- **Suggested fix:** Put one SQL predicate, `notificationVisibleWhere()`, in phase 3, used by both list and count and switched on `type`. Phase 7 must extend that predicate, not the list. Add an int test asserting `count == list.filter(unread).length` for mixed types and hidden chapters.

## Finding 4: Follower notifications are silently lost when the chapter is unreadable at processing time
- **Severity:** Medium
- **Location:** Phase 3, "Requirements" ("Bỏ qua (không tạo) khi tới lúc xử lý chương không còn đọc được … hoặc tác giả bị ban"). "Function / Interface Checklist" (`jobsForChange` only for `published`, "không cho `updated`, `restored`").
- **Flaw:** `firstPublish` fires exactly once per chapter. If the job sees the chapter as unreadable at that moment, the notification is dropped, and no later event ever re-triggers it.
- **Failure scenarios:**
  - A story is `hidden_by_mod` while a report is reviewed, and the author keeps publishing (publish is allowed: only the chapter's own `hidden_by_mod` is blocked). Every chapter published during the hide reaches `canReadChapter` as unreadable and gets 0 notifications. The mod restores the story (`story/restored`), and followers never hear about those chapters.
  - A mod hides a freshly published chapter by mistake, then restores it 2 minutes later. Same loss.
  - With `attempts: 5`, a job retried after a hide is skipped the same way.
- **Evidence:** `packages/core/src/publishing/publish-chapter.ts:52,66-76` (story stays `hidden_by_mod`; the event is still `chapter/published`). `packages/core/src/access/can-read-chapter.ts:20-37` (story visibility gates readability). `packages/core/src/moderation/content-visibility.ts:63-65,102-110` (restore emits `restored`, not `published`). `packages/core/src/content/hooks.ts:97-103`.
- **Suggested fix:** Also map `chapter/restored`, `story/restored` and `user/unbanned` to `notify-followers`. For story/user restores, pass `{storyId}` and fan out over readable chapters with `published_at > now() - interval '7 days'`. The per-chapter `dedupe_key` already makes that safe. Add an int test: hide story → publish → restore → follower has 1 notification.

## Finding 5: No coalescing, so bulk or scheduled publishing floods every follower
- **Severity:** Medium
- **Location:** Phase 3, "Requirements" ("mỗi người tối đa một thông báo mỗi chương"). plan.md "Thông báo".
- **Flaw:** The dedupe is per chapter, so N chapters give N rows per follower. The publish rate limit is 30/hour per author. The sweeper publishes every due chapter in one tick (limit 100), and authors commonly schedule a batch at the same time.
- **Failure scenario:** An author migrates a 200-chapter backlog by scheduling it in bulk. Every follower gets 100 notifications per sweep tick, and the bell sits at "99+". 100 separate `INSERT…SELECT` fan-outs hit the content queue at once. Every other notification (badges, phase 7) is buried, and users learn to ignore the bell.
- **Evidence:** `packages/core/src/publishing/publish-due.ts:17-29` (batch of up to 100 due chapters per run). `packages/shared/src/rate-limits.ts:82-85` (`publishChapter` 30/hour; the scheduler path bypasses it). Phase 3 "Architecture": `dedupe_key = 'chapter:'||chapterId`.
- **Suggested fix:** Coalesce per story while unread, with `dedupe_key = 'story:'||storyId` scoped to unread rows. Use a partial unique `(user_id, dedupe_key) WHERE read_at IS NULL`. Upsert `payload.latestChapterId` / `count` with `ON CONFLICT DO UPDATE`, and render "{Truyện} có N chương mới". Add an int test: 5 chapters published back-to-back → 1 unread row with count 5.

## Finding 6: Comments anchored to heading pids become invisible everywhere
- **Severity:** Medium
- **Location:** Phase 2, "Requirements" (bubbles "chỉ trên `<p data-pid>`") vs "server kiểm … pid nằm trong `paragraph_ids`". "Architecture" orphan rule.
- **Flaw:** `paragraph_ids` contains pids for both paragraphs and headings. The server accepts any pid in it. The chapter list shows only `paragraph_id IS NULL OR pid ∉ paragraph_ids`. The UI renders bubbles only on `<p>`. So a comment on a heading pid passes validation, is excluded from the chapter list (its pid is still present), is counted in `paragraph-counts`, and has no bubble to open it. It is visible nowhere. The same happens if an edit turns a commented paragraph into a heading and the pid is kept (the normalizer keeps valid pids exactly so comments survive edits).
- **Failure scenario:** A crafted `POST /comments {paragraphId: <h2 pid>}`, or an author converting a paragraph into a section heading. The comments vanish, mods cannot see them in context, and the `total` count no longer matches what is displayed.
- **Evidence:** `packages/shared/src/editor/extensions.ts:9` (`PID_NODE_TYPES = ['paragraph','heading']`). `packages/core/src/content/normalize-pids.ts:20-23,59` (`paragraphIds: [...seen]` includes headings; "Valid pids are kept so comments anchored … survive edits"). `packages/core/src/content/walker.ts:57-59` (headings render `data-pid`).
- **Suggested fix:** Either allow bubbles on `h2/h3[data-pid]` too (simplest), or validate and count against the set of `<p>` pids only. Derive it at publish time (for example a `comment_anchor_ids` column, or filter `doc_json`), and treat heading pids as orphaned in the list. Add an int test: comment on a heading pid → rejected (or listed).

## Finding 7: An empty ranking recompute never replaces the old board
- **Severity:** Medium
- **Location:** Phase 5, "Architecture" (`MULTI DEL tmp, ZADD tmp…, RENAME tmp key, EXEC`), "Non-functional" ("không bao giờ có lúc bảng rỗng"), "Risk Assessment" ("`rising` … có thể rỗng").
- **Flaw:** With zero rows, `ZADD tmp` has no members. That is a syntax error, and in MULTI it raises EXECABORT for the whole transaction. If the code skips ZADD instead, `RENAME` on a missing key fails with "no such key". Either way the live key keeps the previous board. The plan's "TTL 2 ngày" means that board stays for up to 2 days. Also, `RENAME` moves the *source* key's TTL, so unless `EXPIRE` is set on `tmp` before the rename, the live key ends up with no TTL at all.
- **Failure scenario:** A spike makes a story "rising". A week later nothing qualifies (`cur < 20`), and `/rankings/rising` keeps showing last week's list for 2 days. The same happens to `general` when every qualifying story is 18+. The read-time `publicStoryWhere` filter removes only hidden or banned stories, not stale ones.
- **Evidence:** Phase 5 "Requirements" `rising`: "chỉ giữ điểm > 0" (an empty result is expected). No empty-branch logic in "Function / Interface Checklist". Related fact error: phase 5 cites `getInfra().redis`, but the web infra exposes `producerRedis` (`apps/web/src/server/infra.ts:66`).
- **Suggested fix:** In `writeRankings`, rows empty → `DEL live` (or write an explicit empty marker). Otherwise `MULTI DEL tmp; ZADD tmp …; EXPIRE tmp 172800; RENAME tmp live; EXEC`. Add int tests: "second recompute with zero rows empties the board" and "live key has TTL". Also apply the 60 s cache to the home ranking section on Redis error, not just to `/rankings`.

## Finding 8: Three new periodic jobs on a 2-slot queue can stall the outbox drain and scheduled publishing
- **Severity:** Medium
- **Location:** plan.md "Outbox và hàng đợi" (new jobs on queue `publishing`). Phase 5 step 3. Phase 7 "Non-functional" (one transaction over 8 aggregate INSERT…SELECTs). Phase 3 prune.
- **Flaw:** The `publishing` queue was isolated so that "the sweeper and the outbox drain" never wait. It runs with `concurrency: 2`, and every scheduler job uses `attempts: 1`. The plan adds `recompute-rankings` (4 windows × aggregate over up to 60 days of `chapter_daily_stats`, plus Redis writes), `award-badges` (8 full-table aggregates in one long transaction) and `prune-notifications` (an unbounded DELETE). Their 15/30/1440-minute intervals line up with each other and with the 5-minute flush.
- **Failure scenario:** At :00/:30, rankings and badges take both slots. The 5 s drain and the 60 s sweeper queue behind them, so scheduled chapters go out late and CDN purges and search syncs lag after a mod hides content. As data grows, each run gets longer, and the existing "two slots so a long sweep never delays the drain" guarantee is gone. On the first production run, badges backfill every author in one transaction, making it the longest run.
- **Evidence:** `apps/worker/src/publishing-worker.ts:45-58` (comment and `concurrency: 2`), `:21-28` (intervals), `:76-86` (`attempts: 1`, all jobs in `PUBLISHING_JOBS` share the queue). `packages/shared/src/queues.ts:11-12` ("Internal periodic jobs only, so slow I/O … never delays scheduled publishing").
- **Suggested fix:** Put aggregate jobs on a separate `stats` queue/worker (concurrency 1), or keep them on `publishing` but raise concurrency and set a `limiter`. Commit badges per badge rather than in one transaction (the notification insert can stay in the same small transaction as its badge). Prune in batches (`DELETE … WHERE id IN (SELECT … LIMIT 5000)`).

## Finding 9: New public lists are never purged on hide/ban, contradicting the plan's own success criteria
- **Severity:** Medium
- **Location:** plan.md "Success Criteria" ("Mọi danh sách công khai mới (xếp hạng, nổi bật, cuộc thi) … không chứa nội dung của tài khoản bị ban"). Phase 5 "Không purge". Phase 9 "Cache … không purge" and the story-page chip "dữ liệu SSR công khai, ổn định". Phase 8 "trang chủ phản ánh trong ≤ 10 phút".
- **Flaw:** `catalogUrls` purges only home, the author page and tag page 1. `/rankings/*` and `/contests/{slug}` are cached with `LIST_CACHE` = `s-maxage=600, stale-while-revalidate=3600` and are not in that list. The contest chip sits on story pages under `PUBLIC_CACHE` (1 day + 1 h SWR), and entering or withdrawing from a contest emits no content change at all.
- **Failure scenario:** A mod hides a story for copyright, or bans a plagiarist. Home and tag pages are purged, but `/rankings/week` and `/contests/{slug}` keep serving the story card (cover, title, author) for up to 70 minutes. An author who withdrew still shows "Dự thi: X" for about 25 h. Featured slot start/end also has no event, so "≤ 10 phút" is really ≤ 10 min + SWR revalidation lag.
- **Evidence:** `packages/core/src/catalog/urls.ts:10-14,18-48` (purge list: home, author, tags only). `apps/web/src/lib/cache-headers.ts:7-9,16-18` (PUBLIC_CACHE and LIST_CACHE with `stale-while-revalidate=3600`). `apps/worker/src/processors/purge-urls.ts:15-20` (purges exactly `urlsFor`).
- **Suggested fix:** Extend `catalogUrls`: for `story`/`chapter`/`user` changes add the 4 `/rankings/{period}` paths and the `/contests/{slug}` of every contest the story entered (join `contest_entries`). Make enter/withdraw/placement call `recordContentChanges({entity:'story', action:'updated'})`, or drop the chip. Restate the phase-8 criterion as "≤ 10 min + SWR" or emit a purge of `/` on end-now.

## Finding 10: Deleting a review and re-posting it gets around a mod's hide
- **Severity:** Medium
- **Location:** Phase 4, "Requirements" (`DELETE /ratings` removes own rating), "Implementation Steps" step 3 ("delete (−1/−score nếu visible)"; edits keep `hidden_by_mod`).
- **Flaw:** The hide is stored on the rating row itself. A hard delete by the author erases it, and the PK `(user_id, story_id)` frees up immediately. The next `PUT` creates a fresh `visible` row and adds it to the totals. The reports are already `resolved`, so nothing re-queues.
- **Failure scenario:** A mod hides a harassing 1-star review from a report. The reviewer deletes it and re-posts the same text. It is visible again and counted in the average, and the mod gets no signal. The same applies to rating-bombing campaigns.
- **Evidence:** `packages/db/src/schema/community.ts:65-83` (PK `(user_id, story_id)`, no tombstone). Phase 4 "Migration" adds `status` to the row only. `packages/core/src/moderation/resolve-reports.ts:81-98` (reports resolved once, never reopened).
- **Suggested fix:** If the row is `hidden_by_mod`, `deleteRating` should only clear the `review` (or reject with `RATING_HIDDEN`). Alternatively, make delete a soft delete (`status='deleted'`) that keeps the hide, and have upsert on a hidden or deleted row keep `hidden_by_mod`. Add an int test: hide → delete → re-PUT → still hidden and not in the totals.

---

## Unresolved questions
- Phase 2: does Tiptap's `toggleHeading`/`setNode` keep the `pid` attribute of the converted paragraph? Not verified, because node_modules reads are blocked here. Finding 6 holds via the API path either way.
- Phase 7 e2e: `globalSetup` truncates every table (`apps/web/e2e/global-setup.ts:16`, `packages/db/src/truncate.ts:8-18`), including `badges`. The helper must call `ensureBadgeCatalog` before `awardMilestoneBadges`, or the award silently inserts nothing. Should `awardMilestoneBadges` call `ensureBadgeCatalog` itself?
- `followers_10/100` badges are permanent, but following needs only a sign-in and sign-in does not require a verified email (`packages/auth/src/auth.ts:140`). Should follower milestones count only verified, non-banned followers?
