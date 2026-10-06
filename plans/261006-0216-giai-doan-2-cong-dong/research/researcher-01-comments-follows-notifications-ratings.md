# Technical Research: Comments, Follows, Notifications, Ratings
**Stage 2 (Community) Design for Novel Hub**

## 1. Chapter Comments (2-Level → Paragraph-Anchored)

### Schema & Indexing

**Design recommendation:** Denormalised `comment_count` column on `chapters` + indexed keyset pagination by `(created_at DESC, id DESC)`.

```sql
-- comments table (already in spec)
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  story_id UUID NOT NULL REFERENCES stories(id),  -- denormalise for notifications
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,  -- NULL = top-level
  paragraph_id TEXT,  -- future: data-pid for inline comments
  body TEXT NOT NULL,  -- plain text only
  status TEXT DEFAULT 'visible',  -- visible/hidden_by_mod/hidden_by_user
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_comments_chapter_created 
  ON comments(chapter_id, created_at DESC, id DESC) 
  WHERE status = 'visible';
CREATE INDEX idx_comments_user ON comments(user_id);
CREATE INDEX idx_comments_paragraph ON comments(paragraph_id) 
  WHERE paragraph_id IS NOT NULL AND status = 'visible';
```

**Denormalise counts on chapters:**
```sql
ALTER TABLE chapters ADD COLUMN comment_count INT DEFAULT 0;
-- Update via trigger on comment insert/delete
```

### Pagination & Loading

**Keyset pagination (cursor-based):** Client sends `after: {created_at, id}`, server returns next 20 comments in reverse insertion order. Avoids offset problems at scale.

**Client-side loading strategy (preserve CDN cache):**
- Server route `/stories/{id}/chapter-{num}` returns HTML with NO comments (zero personalization).
- API endpoint `/api/v1/chapters/{id}/comments?cursor=...` fetches comments after page load.
- Client-side hydration: TanStack Query with stale-while-revalidate, no server cache headers.

### Counting Per-Paragraph

**Recommendation:** Redis counter for real-time UX during reads, materialized nightly to DB.

```ts
// Fetch all paragraph counts in ONE request
async function getParagraphCommentCounts(chapterId: string): Promise<Map<string, number>> {
  const pattern = `chapter:${chapterId}:para:*`;
  const keys = await redis.keys(pattern);  // prod: use SCAN for large datasets
  const counts = await redis.mget(keys);
  
  const result = new Map<string, number>();
  keys.forEach((key, idx) => {
    const paraId = key.split(':').pop();
    result.set(paraId, parseInt(counts[idx] || '0', 10));
  });
  return result;
}

// On comment creation
async createComment(body: string, paragraphId?: string) {
  // ... validate, rate limit, store in DB
  if (paragraphId) {
    await redis.incr(`chapter:${chapterId}:para:${paragraphId}`);
  }
  await redis.incr(`chapter:${chapterId}:total`);
}
```

### Spam, Muting, Rate Limit

**Rate limit:** Max 5 comments per user per chapter per hour (Redis key: `user:{id}:comments:{chapterId}`).

**Muted users:** Cannot comment; existing comments hidden from others (status='hidden_by_mod', visible to mod/author).

**Requirement: Email verified** — better than IP rate limit for single-dev moderation burden.

```ts
if (!user.email_verified) throw new Error('Verify email first');
```

### Soft Delete & Edit Window

**Edit window:** 5 minutes after creation (UX pattern from Wattpad). Flag as "edited" after window closes.

```sql
UPDATE comments SET edited_at = now() WHERE id = $1 AND created_at > now() - '5 min'::interval;
```

**Hidden by user vs mod:** `status` column tracks this; both hidden to readers, visible in mod panel with flag.

### Body Handling

**Store plain text only**, no HTML. Client escapes on render.

```ts
// Input
const body = input.trim().slice(0, 500);  // constraint: ≤500 chars

// Link handling: linkify plain URLs server-side for caching friendliness
const linkified = body.replace(
  /https?:\/\/[^\s)]+/g,
  (url) => `[${url}](${url})`  // markdown-like; client renders as <a>
);
await db.insert(comments).values({ body: linkified, ... });

// Output: client sanitises & linkifies
```

### Report Flow

**User reports comment** → `reports` table (target_type='comment', target_id=comment_id, reason='spam'|'abuse'|'other').
**Mod panel:** Filter by reason, view comment + context (story/chapter/author), action (hide/delete/dismiss).
Logged to `moderation_actions`.

---

## 2. Follows + In-App Notifications

### Schema

```sql
-- polymorphic follows (already in spec)
CREATE TABLE follows (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,  -- 'story' | 'author'
  target_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, target_type, target_id),
  FOREIGN KEY (target_id) REFERENCES stories(id) ON DELETE CASCADE
    WHEN target_type = 'story',
  FOREIGN KEY (target_id) REFERENCES users(id) ON DELETE CASCADE
    WHEN target_type = 'author'
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,  -- 'chapter_published', 'story_updated', etc.
  payload JSONB NOT NULL,  -- {storyId, storyTitle, chapterId, chapterNum, ...}
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_notif_user_read ON notifications(user_id, read_at, created_at DESC);
```

### Fan-Out Strategy

**Recommendation: Fan-out-on-write via BullMQ** (simplest for single dev; scales to 10k+ followers before slow).

```ts
// On chapter publish
async publishChapter(chapterId: string) {
  const chapter = await getChapter(chapterId);
  const storyId = chapter.story_id;
  
  // Queue fan-out job
  await notificationQueue.add('fan-out-chapter', 
    { chapterId, storyId }, 
    { delay: 0 }  // immediate; could defer for off-peak
  );
}

// Worker job: fetch follower batches, send notifications
notificationQueue.process('fan-out-chapter', async (job) => {
  const { chapterId, storyId } = job.data;
  const batchSize = 1000;
  let offset = 0;
  
  while (true) {
    const followers = await db
      .select()
      .from(follows)
      .where(eq(follows.target_id, storyId))
      .offset(offset)
      .limit(batchSize);
    
    if (followers.length === 0) break;
    
    // Create notification for each follower (bulk insert)
    await db.insert(notifications).values(
      followers.map(f => ({
        user_id: f.user_id,
        type: 'chapter_published',
        payload: {
          storyId,
          storyTitle: '...',
          chapterId,
          chapterNum: chapter.number,
          publishedAt: new Date().toISOString()
        },
        created_at: new Date(),
        read_at: null
      }))
    );
    
    offset += batchSize;
  }
});
```

### Idempotency

**Unique constraint per (user, chapter)** to prevent duplicate notifications on retry:

```sql
CREATE UNIQUE INDEX idx_notif_user_chapter 
  ON notifications(user_id, (payload->>'chapterId'))
  WHERE type = 'chapter_published';
```

Or use BullMQ job ID uniqueness:

```ts
const jobId = `notif:${userId}:${chapterId}`;
await notificationQueue.add('send-notification', {...}, { jobId });
```

### Notification Payload

```ts
type NotificationPayload = {
  storyId: string;
  storyTitle: string;
  storyPublicId: string;  // for URL
  chapterId: string;
  chapterNum: number;
  chapterTitle: string;
  publishedAt: string;  // ISO
  authorId?: string;  // if follow-author event
  authorName?: string;
};
```

### Unread Count & Mark Read

**Unread count:** Redis counter (cheap read-heavy pattern).

```ts
// On notification create
await redis.incr(`user:${userId}:notif:unread`);

// Mark read endpoint
async markRead(notificationIds: string[]) {
  await db.update(notifications)
    .set({ read_at: new Date() })
    .where(inArray(notifications.id, notificationIds));
  
  const previousUnread = await redis.get(`user:${userId}:notif:unread`);
  await redis.set(`user:${userId}:notif:unread`, 
    Math.max(0, parseInt(previousUnread || '0') - notificationIds.length)
  );
}

// Unread count endpoint (fast, no DB)
async getUnreadCount(userId: string) {
  return parseInt(await redis.get(`user:${userId}:notif:unread`) || '0');
}
```

### Retention & Pruning

**Worker job runs daily:** Delete notifications older than 90 days.

```ts
notificationQueue.add('prune-notifications', {}, { repeat: { pattern: '0 2 * * *' } });

notificationQueue.process('prune-notifications', async () => {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  await db.delete(notifications).where(lt(notifications.created_at, cutoff));
});
```

### Aggregation

**YAGNI for stage 2:** One notification per chapter. Later: "author posted 3 new chapters" if same story in short time window (track with Redis key).

### Edge Cases

| Case | Handling |
|------|----------|
| Chapter hidden after notification sent | Notification remains but link 404s gracefully (client-side) |
| Author follows self | Exclude in fan-out: `WHERE user_id ≠ $1` |
| Banned author | Skip fan-out; don't create notifications retroactively |
| Scheduled chapter goes live | Same fan-out at scheduled time (BullMQ scheduled job) |

### Polling vs SSE

**Recommendation: Polling (HTTP + interval)** — simplest for single dev, scales fine for <100k concurrent.

```ts
// Client: TanStack Query with refetch on window focus + 30s interval
useQuery({
  queryKey: ['notifications', 'unread-count'],
  queryFn: () => api.getUnreadCount(),
  refetchOnWindowFocus: true,
  refetchInterval: 30000,  // 30s poll
  staleTime: 5000
});
```

SSE adds server complexity (connection pooling, heartbeat, reconnection logic) for marginal UX gain. Defer to stage 3.

---

## 3. Ratings & Reviews

### Schema

```sql
CREATE TABLE ratings (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  score SMALLINT NOT NULL CHECK (score >= 1 AND score <= 5),
  review TEXT,  -- optional, ≤1000 chars
  review_status TEXT DEFAULT 'visible',  -- visible/hidden_by_mod
  helpful_count INT DEFAULT 0,  -- YAGNI for now
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, story_id)
);

-- Denormalise aggregate on stories
ALTER TABLE stories ADD COLUMN rating_avg DECIMAL(3,2) DEFAULT NULL;
ALTER TABLE stories ADD COLUMN rating_count INT DEFAULT 0;

CREATE INDEX idx_ratings_story ON ratings(story_id, created_at DESC);
```

### Aggregate Storage

**Recommendation: Denormalise on `stories` table + background job refresh.**

**Why:** Read-heavy (every story page), write-rare (handful of ratings/day per story). Materialised view not needed.

```ts
// On rating create/update
async upsertRating(userId: string, storyId: string, score: number, review?: string) {
  await db
    .insert(ratings)
    .values({ user_id: userId, story_id: storyId, score, review, ... })
    .onConflictDoUpdate({
      target: [ratings.user_id, ratings.story_id],
      set: { score, review, updated_at: new Date() }
    });
  
  // Queue recalc job
  await ratingQueue.add('recalc-story-rating', { storyId });
}

// Worker: runs ~50ms, updates denormalised columns
ratingQueue.process('recalc-story-rating', async (job) => {
  const { storyId } = job.data;
  const ratings = await db
    .select()
    .from(ratings)
    .where(eq(ratings.story_id, storyId));
  
  const avg = ratings.length > 0
    ? (ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length).toFixed(2)
    : null;
  
  await db.update(stories)
    .set({ rating_avg: avg, rating_count: ratings.length })
    .where(eq(stories.id, storyId));
});
```

### Bayesian Average for Ranking

**For ranking (xếp hạng) endpoint:** Apply Bayesian average to combat low-review-count games.

```ts
function bayesianAverage(rating: { avg: number; count: number }) {
  const minCount = 10;  // threshold
  const globalAvg = 3.5;  // platform average
  
  return (
    (globalAvg * minCount + rating.avg * rating.count) /
    (minCount + rating.count)
  );
}

// Ranking query
const stories = await db
  .select({
    id: stories.id,
    title: stories.title,
    score: sql`(${globalAvg} * ${minCount} + ${stories.rating_avg} * ${stories.rating_count}) / (${minCount} + ${stories.rating_count})`
  })
  .from(stories)
  .where(eq(stories.visibility, 'published'))
  .orderBy(desc(sql`...score...`))
  .limit(20);
```

### Eligibility to Rate

**Recommendation: No minimum chapter read count (simpler), email verified only.**

```ts
if (!user.email_verified) throw new Error('Verify email');
if (user.id === story.author_id) throw new Error('Cannot rate own story');
```

**Why:** Enforcing read count requires tracking; email verification is sufficient anti-spam for stage 2.

### Review Moderation

**Same as comments:** `review_status` column (hidden_by_mod), `reports` table (target_type='review'), mod panel action.

```sql
CREATE INDEX idx_ratings_story_visible 
  ON ratings(story_id, created_at DESC)
  WHERE review_status = 'visible';
```

### Helpful Votes

**YAGNI for stage 2.** Defer to stage 3. Track now if needed: `helpful_count INT` on ratings; don't query it.

---

## Recommendations Ranked

### 1. Comments (High Priority)
- **2-level keyset pagination** (cursor-based, proven at scale)
- **Paragraph counts via Redis** (real-time, batch fetch)
- **Plain text bodies** (safe, searchable, simple)
- **Email verification + rate limit** (spam defense)
- **Edit window 5 min** (UX from Wattpad)

### 2. Follows + Notifications (Critical)
- **Fan-out-on-write** (1000 batches via BullMQ, simple concurrency model)
- **Denormalised unread count in Redis** (O(1) bell badge)
- **Polling 30s** (client-side, no server connection pooling)
- **90-day prune** (nightly job)
- **Unique constraint per (user, chapter)** (idempotency)

### 3. Ratings (Lower Priority, Stage 2b)
- **Denormalised avg/count on stories** (avoid view overhead)
- **Bayesian average for ranking** (fairness)
- **No minimum read requirement** (simpler, email verified enough)
- **Helper vote YAGNI** (defer to stage 3)

---

## Implementation Phases

**Phase 1:** Comments (2-level only, no paragraph_id queries). Test keyset pagination. ~3 days.
**Phase 2:** Follows + notifications. Test fan-out at scale (seed 100k followers, publish chapter). ~2 days.
**Phase 3:** Ratings. Test Bayesian formula. ~1 day.

---

## Unresolved Questions

1. **Comment edit history:** Track edit versions or discard old? (YAGNI: discard, mark as 'edited')
2. **Paragraph comment UI rollout:** Stagger after 2-level comments, or parallel? (Likely parallel; schema ready now)
3. **Notification payload size limit:** Cap jsonb size to prevent bloat? (No, Postgres handles it; prune old)
4. **Author notification on new comment:** Separate type ('comment_on_chapter_you_authored') or in follow logic? (Separate; author auto-follows own chapters)
5. **Helpful votes auth:** Allow anonymous? (No; email verified, enforced in UI)
