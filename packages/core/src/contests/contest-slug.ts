import { type Tx, contests } from '@novel-hub/db';
import { slugify } from '@novel-hub/shared';
import { eq, like, or, sql } from 'drizzle-orm';

/**
 * A slug for a new contest: the title's slug, or with `-2`, `-3`… when taken (contest URLs hold
 * only the slug, so it must be unique). A transaction-scoped advisory lock serialises concurrent
 * creations, so two contests with the same title cannot pick the same slug.
 */
export async function uniqueContestSlug(tx: Tx, title: string): Promise<string> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('contests.slug'))`);
  const base = slugify(title);
  const rows = await tx
    .select({ slug: contests.slug })
    .from(contests)
    .where(or(eq(contests.slug, base), like(contests.slug, `${base}-%`)));
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
