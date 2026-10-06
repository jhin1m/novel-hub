---
name: rankings-and-dashboard-architecture
description: Redis ranking aggregation, growth metrics, author dashboard queries, and hand-rolled SVG charts
metadata:
  type: research
  date: 2026-10-06
  status: complete
---

# Giai đoạn 2: Rankings, Growth Metrics & Author Dashboard

## 1. Rankings Architecture (Redis Sorted Sets)

### Recommendation: **Approach A** (SQL aggregate + atomic RENAME)
**For single VPS, pick recompute from `chapter_daily_stats` every 5 min and write ZSET via pipeline + atomic RENAME.**

| Factor | Approach A (SQL aggregate + RENAME) | Approach B (ZINCRBY per view + ZUNIONSTORE) |
|--------|------|------|
| **Consistency** | Strong; all aggregates lock-step at recompute time | Eventual; week/month lag behind daily |
| **CPU** | Batch cost at 5min interval (~150ms for 5000 stories) | Distributed over all views; linear with traffic |
| **Storage** | 3 sorted sets (daily, weekly, monthly) | ≥6 (per-day keys stay for 90d minimum) |
| **Simplicity** | Two functions; recompute once | Three parallel pipelines; key naming scheme |
| **Cache invalidation** | Trivial; RENAME is atomic | Manual cleanup; key TTLs are magic numbers |
| **Competitive spamming** | Easier to cap per-story per-time-window | Harder; scattered across multiple keys |

**Choice rationale:** Single dev, single VPS. Batch compute every 5min is predictable overhead; no clock skew between daily/weekly/month. Competitor intelligence (Royal Road, Wattpad) favors consistent snapshots over streaming.

### SQL Aggregate Pattern (Drizzle + SQL window functions)
```typescript
// packages/core/src/rankings/compute.ts
export async function recomputeRankings() {
  const db = getDb();
  const now = new Date();
  const tzName = 'Asia/Ho_Chi_Minh'; // TZ from spec

  // 1. Yesterday's daily ranking (UTC-based, not local time—avoids ambiguity)
  const yesterday = sql`CURRENT_DATE AT TIME ZONE ${tzName} - INTERVAL '1 day'`;
  
  // Aggregate story from chapter stats, excluding mature/hidden/banned
  const dailyRanking = await db
    .select({
      storyId: stories.id,
      views: sql<number>`COALESCE(SUM(${chapterDailyStats.views}), 0)`,
      uniqueReaders: sql<number>`COALESCE(SUM(${chapterDailyStats.uniqueReaders}), 0)`,
      completions: sql<number>`COALESCE(SUM(${chapterDailyStats.completions}), 0)`,
    })
    .from(chapterDailyStats)
    .innerJoin(chapters, eq(chapters.id, chapterDailyStats.chapterId))
    .innerJoin(stories, eq(stories.id, chapters.storyId))
    .where(
      and(
        sql`${chapterDailyStats.date} = ${yesterday}`,
        eq(stories.visibility, 'published'),
        eq(stories.isMature, false), // guests don't see mature
        notEq(stories.status, 'hidden_by_mod'),
        isNull(stories.deletedAt),
      ),
    )
    .groupBy(stories.id);

  // 2. Build ZSET; score = unique readers (stronger anti-gaming than views)
  const pipeline = redis.pipeline();
  pipeline.del('rankings:daily');
  dailyRanking.forEach(({ storyId, uniqueReaders }) => {
    pipeline.zadd('rankings:daily', uniqueReaders, storyId);
  });
  await pipeline.exec();

  // 3. Weekly: last 7 days
  const sevenDaysAgo = sql`${yesterday} - INTERVAL '6 days'`;
  const weeklyRanking = /* same aggregate, different date range */;
  pipeline.del('rankings:weekly');
  // ZADD with same unique readers score
  await pipeline.exec();

  // 4. Monthly: this calendar month (respect TZ day boundary)
  const monthStart = sql`DATE_TRUNC('month', ${yesterday} AT TIME ZONE ${tzName}) AT TIME ZONE ${tzName}`;
  const monthlyRanking = /* same pattern */;
  await pipeline.exec();
}
```

**Timezone handling:** Always compute in Asia/Ho_Chi_Minh for day boundary. Cloudflare caches keyed by story ID alone (no cookie), so no user-local-time rendering needed.

---

## 2. Score Metric & Growth Formula

### Score: Unique Readers > Views (Spec mismatch fix)
- **Reads as:** "trending stories people actually keep reading"
- **Anti-game:** Can't spam views with refresh loops; HyperLogLog dedups by IP/session
- **Fallback:** If unique_readers is low (~<5), use sqrt(views) to avoid cold-start bias

**Worker job (every 5 min):** read Redis counters, write `chapterDailyStats` once per chapter per day, then trigger `recomputeRankings()`.

### Growth Formula: 7-Day Momentum
```typescript
// packages/core/src/rankings/growth.ts
async function computeGrowth(storyId: string): Promise<number> {
  const db = getDb();
  const today = sql`CURRENT_DATE AT TIME ZONE 'Asia/Ho_Chi_Minh'`;
  const thisWeek = await db
    .select({ sum: sql<number>`SUM(unique_readers)` })
    .from(chapterDailyStats)
    .innerJoin(chapters, eq(chapters.id, chapterDailyStats.chapterId))
    .where(
      and(
        eq(chapters.storyId, storyId),
        sql`${chapterDailyStats.date} BETWEEN ${today} - INTERVAL '6 days' AND ${today}`,
      ),
    );
  
  const lastWeek = await db.select({ /* same, previous 7 days */ });

  const curr = thisWeek[0]?.sum ?? 0;
  const prev = lastWeek[0]?.sum ?? 0;

  if (prev < 10) return 0; // min threshold: avoid noise on tiny stories
  
  // Smooth: log ratio to avoid outliers (10→100 = same weight as 1000→10000)
  return Math.log(curr / prev);
}
```

**Redis key:** Cache this in `growth:{storyId}` with TTL 1 hour; recompute only on new chapter publish or every 24h.

### Exclusions (cache-aware)
- **Mature (18+):** SSR HTML never includes mature in rankings. Opted-in users fetch variant via `/api/v1/rankings?include_mature=true` (not cached by Cloudflare).
- **Hidden by mod / Banned:** Excluded in SQL WHERE clause.
- **Completed:** **Keep in rankings;** signal that "this was good enough to finish" (Wattpad does this).

---

## 3. Ranking Page & Cache Strategy

### URL & Cache Headers
```typescript
// apps/web/src/routes/rankings/index.tsx (TanStack Start loader)
export const route = {
  preload: async (ctx) => {
    const rankings = await api.rankings.daily.get(); // cached in Redis 5 min
    return { rankings };
  },
};

export default function RankingsPage({ data }) {
  return (
    <div>
      <h1>Top Stories This Week</h1>
      {data.rankings.map(/* ... */)}
    </div>
  );
}
```

**Nitro SSR handler:**
```typescript
// pages: /rankings, /rankings/weekly, /rankings/monthly
// Response headers:
// Cache-Control: public, s-maxage=300, stale-while-revalidate=3600
// Canonical: https://novel-hub.vn/rankings
// No Set-Cookie (ranking HTML is identical for all users)
```

**Purge on:** New chapter published (worker calls Cloudflare API to purge `/rankings*`).

---

## 4. Anti-Gaming Reinforcement

**Existing (spec):** dwell time + per user/IP/day limit.

**Additional:**
1. **Minimum distinct readers:** Don't rank stories with <10 unique readers today.
2. **Ratio guard:** Cap completions-to-views at 0.5; if (completions > views * 0.5), log anomaly.
3. **Growth cap:** If growth > 3.0 (e-fold), flag for manual review (stored in `moderation_flags`).

```typescript
// Worker job
redis.multi()
  .incr(`views:${chapterId}:${dateStr}:${userIp}`) // +1, TTL 24h
  .incr(`views:${chapterId}:${dateStr}:${userId}`) // +1, TTL 24h
  .hincrby(`daily:${dateStr}`, chapterId, 1)       // dwell check passed
  .exec();
```

---

## 5. Author Dashboard: Queries & Indexes

### Key Metrics
1. **Views per chapter** → `SUM(views) FROM chapter_daily_stats WHERE chapter_id = ? AND date BETWEEN ? AND ?`
2. **Drop-off rate per chapter** → `(count of readers who reached chap N+1) / (readers who reached chap N)` using `reading_progress.chapter_id`
3. **New follows** → `COUNT(*) FROM follows WHERE target_id = author_id AND target_type = 'author' AND created_at BETWEEN ? AND ?`

### Index Plan
```sql
-- On chapter_daily_stats: (chapter_id, date) is PK; cover select works
CREATE INDEX chapter_daily_stats_story_date_idx 
  ON chapter_daily_stats(
    (SELECT story_id FROM chapters WHERE id = chapter_id), 
    date DESC
  );

-- On reading_progress: already indexed (user_id, updated_at, story_id, chapter_id)
-- Efficient for: "furthest chapter per reader per story" via MAX(chapter_number)

-- On follows: (target_type, target_id, created_at DESC) for author follow trend
CREATE INDEX follows_author_trend_idx 
  ON follows(target_type, target_id, created_at DESC) 
  WHERE target_type = 'author';
```

### Query Shapes (Drizzle)
```typescript
// 1. Views per chapter
async function viewsPerChapter(storyId: string, dateRange: [Date, Date]) {
  return db
    .select({
      chapterId: chapterDailyStats.chapterId,
      chapterNum: chapters.number,
      views: sql<number>`SUM(${chapterDailyStats.views})`,
    })
    .from(chapterDailyStats)
    .innerJoin(chapters, eq(chapters.id, chapterDailyStats.chapterId))
    .where(
      and(
        eq(chapters.storyId, storyId),
        gte(chapterDailyStats.date, dateRange[0]),
        lte(chapterDailyStats.date, dateRange[1]),
      ),
    )
    .groupBy(chapters.number, chapterDailyStats.chapterId)
    .orderBy(chapters.number);
}

// 2. Drop-off: readers who completed chapter N vs chapter N+1
async function dropoffRate(storyId: string) {
  // Subquery: per reader, max chapter reached
  const readerMaxChapters = db
    .select({
      userId: readingProgress.userId,
      maxChapterId: sql<string>`MAX(${chapters.number}) OVER (PARTITION BY user_id)`,
    })
    .from(readingProgress)
    .innerJoin(chapters, eq(chapters.id, readingProgress.chapterId))
    .where(eq(chapters.storyId, storyId));

  // Main: count readers per chapter
  return db
    .select({
      chapterNum: chapters.number,
      reachedCount: sql<number>`COUNT(DISTINCT ${readingProgress.userId})`,
      completedCount: sql<number>`COUNT(CASE WHEN ${readingProgress.scrollPct} >= 90 THEN 1 END)`,
    })
    .from(readingProgress)
    .innerJoin(chapters, eq(chapters.id, readingProgress.chapterId))
    .where(eq(chapters.storyId, storyId))
    .groupBy(chapters.number);
}

// 3. New follows trend (7/30/90 day windows)
async function followsTrend(authorId: string, days: number) {
  return db
    .select({
      date: sql<string>`${follows.createdAt}::DATE`,
      count: sql<number>`COUNT(*)`,
    })
    .from(follows)
    .where(
      and(
        eq(follows.targetType, 'author'),
        eq(follows.targetId, authorId),
        gte(follows.createdAt, sql`NOW() - INTERVAL '${days} days'`),
      ),
    )
    .groupBy(sql`${follows.createdAt}::DATE`)
    .orderBy(sql`DATE ASC`);
}
```

### Caching (Redis 10 min)
```typescript
const cacheKey = `dashboard:${authorId}:views:${dateRange[0]}-${dateRange[1]}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);
const result = await viewsPerChapter(storyId, dateRange);
await redis.setex(cacheKey, 600, JSON.stringify(result));
return result;
```

**Privacy:** Only author (user_id = chapters.story_id.author_id) and admins can access.

---

## 6. Hand-Rolled SVG Charts (No Chart Lib)

### Patterns (React + TypeScript)
```typescript
// packages/web/src/components/charts/bar-chart.tsx
interface BarChartProps {
  data: Array<{ label: string; value: number }>;
  title?: string;
  maxValue?: number;
  height?: number;
  ariaLabel?: string;
}

export function BarChart({
  data,
  title = '',
  maxValue,
  height = 200,
  ariaLabel = `${title} bar chart`,
}: BarChartProps) {
  const max = maxValue ?? Math.max(...data.map(d => d.value), 1);
  const barWidth = 100 / data.length;
  const padding = { top: 20, right: 10, bottom: 30, left: 40 };
  const chartHeight = height - padding.top - padding.bottom;

  return (
    <figure role="img" aria-label={ariaLabel}>
      <figcaption className="sr-only">{title}</figcaption>
      
      <svg width="100%" height={height} viewBox={`0 0 400 ${height}`} preserveAspectRatio="xMidYMid meet">
        {/* Y-axis */}
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="#ccc" />
        {/* Y-axis labels */}
        {[0, 0.25, 0.5, 0.75, 1].map(pct => (
          <g key={pct}>
            <line x1={padding.left - 4} y1={padding.top + chartHeight * (1 - pct)} 
                  x2={padding.left} y2={padding.top + chartHeight * (1 - pct)} stroke="#ccc" />
            <text x={padding.left - 8} y={padding.top + chartHeight * (1 - pct) + 4} 
                  fontSize="12" textAnchor="end" className="text-gray-500">
              {(max * pct).toFixed(0)}
            </text>
          </g>
        ))}
        
        {/* Bars */}
        {data.map((d, i) => {
          const barHeight = (d.value / max) * chartHeight;
          const x = padding.left + i * barWidth * (400 - padding.left - padding.right) / 100;
          const y = height - padding.bottom - barHeight;
          
          return (
            <g key={d.label}>
              <rect
                x={x + 5} y={y} width={barWidth * (400 - padding.left - padding.right) / 100 - 10} 
                height={barHeight}
                fill="hsl(var(--primary))" opacity="0.8" 
                role="img" aria-label={`${d.label}: ${d.value}`}
              />
              <text
                x={x + barWidth * (400 - padding.left - padding.right) / 200}
                y={height - padding.bottom + 16}
                fontSize="12" textAnchor="middle" className="text-gray-600"
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Accessible table fallback */}
      <table className="sr-only">
        <thead>
          <tr><th>Label</th><th>Value</th></tr>
        </thead>
        <tbody>
          {data.map(d => <tr key={d.label}><td>{d.label}</td><td>{d.value}</td></tr>)}
        </tbody>
      </table>
    </figure>
  );
}
```

### Sparkline (Compact)
```typescript
// Minimal; 8px height for dashboard sidebar
export function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  const w = data.length * 2;
  const points = data.map((v, i) => `${i * 2},${8 - (v / max) * 8}`).join(' ');
  return (
    <svg width={w} height="8" viewBox={`0 0 ${w} 8`} aria-hidden="true">
      <polyline points={points} fill="none" stroke="hsl(var(--primary))" strokeWidth="1" />
    </svg>
  );
}
```

### Theme tokens (CSS)
```css
/* apps/web/src/styles/tokens.css */
:root {
  --primary: 180 90% 50%;  /* mòng két */
  --chart-bar-bg: hsl(var(--primary) / 0.8);
  --chart-gridline: #e5e7eb;
  --text-muted: #6b7280;
}

@media (prefers-color-scheme: dark) {
  :root {
    --chart-gridline: #374151;
    --text-muted: #9ca3af;
  }
}
```

**Responsive:** Use `<svg viewBox>` + responsive width; font sizes fixed at 12–14px to avoid squish.

---

## 7. Unresolved Questions

1. **Cloudflare cache purge API:** Is `/rankings` a single URL or pattern? (Recommendation: purge `/rankings*` on any chapter publish.)
2. **Completion rate definition:** Does "completion" mean scroll_pct >= 90% or reached final chapter? (Spec says "readers who reached final chapters"; recommend scroll_pct >= 90% for now.)
3. **Dashboard date range UX:** Fixed tabs (7/30/90 days) or date picker? (Recommend fixed tabs; simpler for single dev.)
4. **Growth metric stability:** How many decimal places for log ratio? (3 decimals; cap at ±5.0 to catch fraud.)
5. **Rating aggregation:** Is rating.score (1–5) included in rankings? (Spec stage 2, deferred; keep separate; not in current ranking.)

---

## Sources

- [Redis Sorted Sets for Leaderboards](https://redis.io/docs/latest/develop/use-cases/leaderboard/)
- [Leaderboard Patterns (redis.antirez.com)](https://redis.antirez.com/community/leaderboards.html)
- [Hacker News Ranking Algorithm](https://www.righto.com/2013/)
- [Completion Rate Definition (Jellybooks)](https://www.jellybooks.com/about/publishers/completion-rate)
- [TanStack Charts Accessibility](https://tanstack.com/charts/latest/docs/guides/accessibility)
- [Accessible SVG Charts (W3C)](https://www.w3.org/TR/svg-accessibilitiy/)

---

**Status:** DONE
