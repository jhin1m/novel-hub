---
name: badges-featured-contests
description: Minimal designs for badges/milestones, featured slots, and themed contests for stage 2
metadata:
  type: research
  date: 2026-10-06
---

# Badges, Featured Slots & Themed Contests — Research Report

## 1. Badges & Milestones

### Existing Schema
- `badges(id, code, name, description)` — catalogue (code = "first_story", "100_followers"…)
- `user_badges(user_id, badge_id, awarded_at)` — unique (user_id, badge_id); idempotent
- Zero populated; ready for seed.

### Year One Minimal Set (5–7 badges)

**Authors:**
- `first_story` — published first story (emit after chapter 1 published)
- `10_chapters` — published 10+ chapters on any story
- `100k_words` — cumulative 100k words across all stories
- `first_100_followers` — story reached 100 followers (any story)

**Readers:**
- `100_chapters_read` — finished 100+ chapters (from `reading_progress`/`chapter_daily_stats`)
- `first_comment` — posted first comment (emit after comments.status = 'visible')
- `100_followers_given` — followed 100+ authors (from `follows` count)

**Rationale:** Track author commitment (persistence), reader engagement (depth). Wattpad/Royal Road/Qidian all use follower/word-count milestones; simple to audit; no fraud risk year one.

### Award Mechanism: Event-Driven via Outbox

Preferred pattern (matches worker + idempotency):

1. When action occurs (chapter published, comment approved, follower added): write to `content_events` outbox with event type `chapter.published`, `comment.approved`, `follow.created`.
2. Worker polls `content_events`, calculates eligibility (e.g., `SELECT COUNT(*) FROM chapters WHERE author_id=$1 AND status='published'`).
3. If eligibility met: **`INSERT INTO user_badges VALUES ($user_id, $badge_id, NOW()) ON CONFLICT DO NOTHING`** (idempotent).
4. Emit `user.badge_awarded` outbox event → worker creates notification.
5. Mark outbox event processed.

**Alternative (periodic sweep):** Run job every 6h that sweeps all users; slower to award but simpler logic. **Recommendation: start with event-driven (cleaner).**

### Display & Notification

- **Author profile:** Show `user_badges` as small icons; click → tooltip with name + awarded date. No progressive disclosure needed year one.
- **Notification:** On award, create `notifications` row with `type='badge_awarded'`, `payload={badge_id, badge_name}`. Frontend shows as toast + marks badge list updated.
- **Audit:** Log badge award in `moderation_actions` table (target_type='user', action='badge_awarded', note=badge_code) for mod transparency.

---

## 2. Featured Slots

### Existing Schema
`featured_slots(id, story_id, slot, starts_at, ends_at)` — ready; indices on (slot, starts_at), story_id.

### Slot Semantics & Design

**Slot Types (as text, validated in code):**
- `home_hero` — single story, top hero section (replace auto "Mới đáng chú ý")
- `home_section_1` / `home_section_2` — featured row grid (3–5 slots per row)
- (Leave room: `tag_featured_<slug>`, `author_spotlight` for later)

**Rules:**
- Overlapping slots OK (e.g., story A in hero + row 1 simultaneously).
- Slot × time window unique? No constraint needed; mod picks. If conflict: first-by-start-time wins (in query).
- Empty slot at query time → fallback to auto "Mới đáng chú ý" (story created ≤30d, ≥3 chapters, ≥10k words).

### Mod UI

Three-step form:
1. **Pick story:** typeahead by public_id or title (call `/api/v1/stories/search?q=...`; return [{public_id, title, author_name}]).
2. **Choose slot & window:** dropdown (home_hero / home_section_1 / home_section_2), date-time pickers (starts_at / ends_at). Validate `ends_at > starts_at` in schema + form.
3. **Submit:** POST `/api/v1/moderation/featured-slots` (auth: mod role). Create row + log in `moderation_actions`.

**Edit/Renew:** GET `/api/v1/moderation/featured-slots?slot=home_hero&after=<now>` → list active + upcoming. PATCH to extend, DELETE to cancel. All trigger purge.

### CDN Cache Invalidation

**Home page (`/`):** SSR, cache-control `public, s-maxage=600, stale-while-revalidate=3600`.

**Cache purge strategy:**
- When featured slot created/deleted/updated: worker calls Cloudflare API `POST /purge` with URL `/` only (small scope).
- OR: Set `s-maxage=60` on home (shorter, simpler; sacrifice slight performance for zero purge complexity).

**Recommendation: short s-maxage (60s) over complexity** — fits single-dev constraint; CDN still caches 60s × traffic = major benefit.

---

## 3. Themed Contests

### Minimal Schema (Code-Based Tags or Dedicated Table)

**Option A (minimal): no new table — reuse tags + metadata**
- Add tag with kind=`contest` (not `genre`/`theme`/`warning`).
- Contest details (rules, window, status) encoded in tag `description` (JSONB); brittle, no structure.

**Option B (recommended): single contests table**
```sql
CREATE TABLE contests (
  id UUID PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,                 -- "autumn-2026-fantasy"
  title TEXT NOT NULL,                       -- "秋之夢：幻想故事大賽"
  description TEXT,                          -- rules, prizes (none year 1), theme
  theme_tag_ids UUID[] DEFAULT '{}',         -- primary tag, e.g., fantasy
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',    -- planned/open/closed/judging/finished
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CHECK (ends_at > starts_at)
);

-- Eligibility: story.created_at >= contest.starts_at AND story.created_at < contest.ends_at
-- Entry = (story_id, contest_id) via self-join story.main_tag_id IN theme_tag_ids
```

**No separate entries table:** entry = story tagged with contest theme + created within window. Simple, audit-ready.

### Eligibility & Workflow

1. **Submit:** Story author tags story with contest theme (e.g., "Fantasy"). If story created within contest window → auto-eligible. No button click needed.
2. **List entries:** Query stories where `main_tag_id IN (contest.theme_tag_ids)` AND `created_at BETWEEN contest.starts_at AND contest.ends_at` AND `status='published'`.
3. **Ranking:** Sort by `reading_progress` count (readers who progressed) OR `ratings` average (if available). No voting system year 1.
4. **Winners:** Mod manually picks N stories, logs in `moderation_actions` with action=`contest_winner_selected`. Badge system: emit outbox event `contest.winner_announced` → create badge if not exists, award to author.

### Page & UI

- **Contest listing:** `/contests` — grid of open/closed contests, link to `/contests/<slug>`.
- **Contest detail:** `/contests/<slug>` — rules, theme tag, entries sorted by popularity, mod-picked winners at top.
- **Mod panel:** Existing `/moderation` → new tab "Contests" → create new (form), edit status/theme, pick winners (checkbox list of entries, save).

### Why No Separate Entries Table

- Entries are implicit (story + tag + time); reduces schema complexity.
- Eligibility is declarative, not managed state (no "submit entry" action, no separate status column).
- Audit trail via `stories.created_at` + `story_tags` link; no new audit table.
- Scaling: if contests grow, add `contest_entries(story_id, contest_id, submitted_at)` with `ON CONFLICT` for explicit entry tracking — no schema break, just add column.

---

## Ranked Recommendations

### Badges (Priority 1)
1. **Seed badges as code constants** (`packages/shared/constants/badges.ts`) + one-time migration to `badges` table. Simplest, type-safe.
2. **Event-driven awards via outbox.** Use existing `content_events` pipeline; no new infrastructure.
3. **Emit notifications on award.** Integrate with existing notification system (already in schema).
4. **Display as row on author profile.** No dedicated badges page year 1.

### Featured Slots (Priority 2)
1. **Use existing `featured_slots` table; start with 2–3 slots** (hero, 2× section rows). Mod picks story + window via simple form.
2. **Short cache (60s)** on home, no purge logic. Trade slight memory cost for zero operational complexity.
3. **Fallback to auto "Mới đáng chú ý"** when slot empty. Query logic: `SELECT * FROM featured_slots WHERE slot=$1 AND starts_at <= NOW() AND ends_at > NOW() ORDER BY starts_at LIMIT 1`.
4. **Audit:** Log all changes in `moderation_actions`.

### Contests (Priority 3)
1. **Dedicated `contests` table** (not tags). Cleaner than embedding in description.
2. **No separate entries table.** Eligibility = story.main_tag_id in contest.theme_tag_ids AND created_at in window.
3. **Manual winner selection** (no voting). Mod picks via checkbox, emits badge award event.
4. **One `/contests/<slug>` page.** Show rules, theme, sorted entries, mod-picked winners. Kept simple for year 1.

---

## Unresolved Questions

1. **Badge rarity targets:** Wattpad/Royal Road don't publish percentiles; Qidian badges are earnings-gated (paid tier). What % of authors should reach "100k_words"? Adjust threshold if needed after 3 months.
2. **Featured slot overlap handling:** If two active slots match same story on same row, which renders? Recommend: first-by-start-time wins (in SQL `ORDER BY starts_at LIMIT 1`), but confirm UX preference.
3. **Contest voting vs. mod-pick:** Year 1 is mod-pick (simpler). When open voting, do readers rate (1–5 star) or just vote (thumbs up)? Defer design.
4. **Multi-language badges:** Badges code is constant; name/description from i18n. Does badge list need i18n support or display in Vietnamese only? (Assume Vietnamese only for year 1.)
5. **Historical data:** Seed initial badges now, or at deploy time? Recommend **now** (idempotent, testable in staging).

---

**Status:** DONE
**Summary:** Minimal, event-driven badges (5–7 milestones); featured slots reuse existing schema (60s cache, no purge); contests via new table with implicit eligibility (no entries table). All designed for single dev, no external voting/payment infrastructure.
**Verified:** Schema inspected; platforms (Wattpad/Royal Road/Qidian/AO3) reviewed for patterns; no breaking changes to existing stage 1 code.
