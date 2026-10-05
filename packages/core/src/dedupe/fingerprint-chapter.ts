import {
  type Db,
  chapterContents,
  chapterFingerprints,
  chapters,
  reports,
  stories,
} from '@novel-hub/db';
import {
  DEDUPE,
  type DuplicateReportDetail,
  type EditorDocJson,
  docToText,
  duplicateReportDetail,
} from '@novel-hub/shared';
import { and, arrayOverlaps, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { lshKeys } from './lsh';
import { jaccardEstimate, minhash } from './minhash';
import { normalizeForDedupe, shingles } from './normalize';
import { hamming64, simhash } from './simhash';

/** `reports.reason` of the automatic duplicate reports. */
export const DUPLICATE_REASON = 'duplicate';

export interface FingerprintResult {
  /**
   * `skipped`: not a published, live chapter. `stored`: fingerprinted, no report needed.
   * `reported`: a new automatic report was filed. `already_reported`: the open one already exists.
   */
  status: 'skipped' | 'stored' | 'reported' | 'already_reported';
  /** Highest estimated Jaccard similarity to another author's chapter; `null` when not compared. */
  bestJaccard: number | null;
  /** New open reports inserted by this run (one per copied chapter); only set when reporting. */
  reportsFiled?: number;
}

interface Signature {
  minhash: number[];
  simhash: bigint;
  lshKeys: number[];
}

interface Match {
  /** The probable copy (published later) and the chapter it matches. */
  targetId: string;
  matchedId: string;
  jaccard: number;
  hamming: number;
}

/**
 * Fingerprints a published chapter and compares it with other authors' published chapters
 * (spec section 7). For every pair at or above the Jaccard threshold an automatic `duplicate`
 * report is filed on the later published chapter of the pair (at most one open report per
 * chapter); nothing is hidden, a moderator decides.
 *
 * Idempotent, without a transaction on purpose: the fingerprint is committed before the candidate
 * query, so of two copies published at the same moment the later query always sees the other one.
 * The partial unique index `reports_open_auto_key` with `ON CONFLICT DO NOTHING` keeps repeated
 * and concurrent runs to one open report, and the pair is ordered by publish time, so whichever
 * chapter is checked first the report lands on the same target.
 */
export async function fingerprintChapter(db: Db, chapterId: string): Promise<FingerprintResult> {
  const [row] = await db
    .select({
      status: chapters.status,
      deletedAt: chapters.deletedAt,
      publishedAt: chapters.publishedAt,
      authorId: stories.authorId,
      docJson: chapterContents.docJson,
      contentHash: chapterContents.contentHash,
      fpMinhash: chapterFingerprints.minhash,
      fpSimhash: chapterFingerprints.simhash,
      fpLshKeys: chapterFingerprints.lshKeys,
      fpContentHash: chapterFingerprints.contentHash,
    })
    .from(chapters)
    .innerJoin(stories, eq(stories.id, chapters.storyId))
    .innerJoin(chapterContents, eq(chapterContents.chapterId, chapters.id))
    .leftJoin(chapterFingerprints, eq(chapterFingerprints.chapterId, chapters.id))
    .where(eq(chapters.id, chapterId));
  if (!row || row.status !== 'published' || row.deletedAt !== null) {
    return { status: 'skipped', bestJaccard: null };
  }

  const set = shingles(normalizeForDedupe(docToText(row.docJson as EditorDocJson)));
  let signature: Signature;
  if (
    row.fpContentHash === row.contentHash &&
    row.fpMinhash !== null &&
    row.fpSimhash !== null &&
    row.fpLshKeys !== null
  ) {
    // The stored fingerprint was computed from this exact content: only compare again.
    signature = { minhash: row.fpMinhash, simhash: row.fpSimhash, lshKeys: row.fpLshKeys };
  } else {
    const mh = minhash(set);
    signature = { minhash: Array.from(mh), simhash: simhash(set), lshKeys: lshKeys(mh) };
    const values = { ...signature, contentHash: row.contentHash };
    await db
      .insert(chapterFingerprints)
      .values({ chapterId, ...values })
      .onConflictDoUpdate({ target: chapterFingerprints.chapterId, set: values });
  }
  if (set.size < DEDUPE.minShingles) return { status: 'stored', bestJaccard: null };

  const candidates = await db
    .select({
      chapterId: chapterFingerprints.chapterId,
      minhash: chapterFingerprints.minhash,
      simhash: chapterFingerprints.simhash,
      publishedAt: chapters.publishedAt,
    })
    .from(chapterFingerprints)
    .innerJoin(chapters, eq(chapters.id, chapterFingerprints.chapterId))
    .innerJoin(stories, eq(stories.id, chapters.storyId))
    .where(
      and(
        arrayOverlaps(chapterFingerprints.lshKeys, signature.lshKeys),
        eq(chapters.status, 'published'),
        isNull(chapters.deletedAt),
        ne(stories.authorId, row.authorId),
        ne(chapterFingerprints.chapterId, chapterId),
      ),
    )
    // Most shared band keys first, so a crowded bucket never pushes the closest chapters out.
    .orderBy(
      desc(
        sql`cardinality(array(select unnest(${chapterFingerprints.lshKeys}) intersect select unnest(${sql.param(signature.lshKeys)}::int[])))`,
      ),
    )
    .limit(DEDUPE.maxCandidates);
  if (candidates.length === 0) return { status: 'stored', bestJaccard: null };

  const self = { id: chapterId, publishedAt: row.publishedAt };
  const scored = candidates
    .map((candidate) => {
      const [target, matched] = orderByPublishTime(self, {
        id: candidate.chapterId,
        publishedAt: candidate.publishedAt,
      });
      return {
        targetId: target.id,
        matchedId: matched.id,
        jaccard: jaccardEstimate(signature.minhash, candidate.minhash),
        hamming: hamming64(signature.simhash, candidate.simhash),
      } satisfies Match;
    })
    .sort((a, b) => b.jaccard - a.jaccard);
  const bestJaccard = scored[0]?.jaccard ?? null;

  const above = scored.filter((match) => match.jaccard >= DEDUPE.jaccard);
  if (above.length === 0) return { status: 'stored', bestJaccard };
  const dismissed = await dismissedPairs(db, [...new Set(above.map((m) => m.targetId))]);
  // Best undismissed match per target: this chapter may be the copy of one chapter and the
  // original of several others, and each copy needs its own report whatever the check order.
  const perTarget = new Map<string, Match>();
  for (const match of above) {
    if (dismissed.has(pairKey(match.targetId, match.matchedId))) continue;
    if (!perTarget.has(match.targetId)) perTarget.set(match.targetId, match);
  }
  if (perTarget.size === 0) return { status: 'stored', bestJaccard };

  const inserted = await db
    .insert(reports)
    .values(
      [...perTarget.values()].map((match) => {
        const detail: DuplicateReportDetail = {
          matchedChapterId: match.matchedId,
          jaccard: match.jaccard,
          hamming: match.hamming,
        };
        return {
          reporterId: null,
          targetType: 'chapter',
          targetId: match.targetId,
          reason: DUPLICATE_REASON,
          detail: JSON.stringify(detail),
        };
      }),
    )
    .onConflictDoNothing()
    .returning({ id: reports.id });
  return {
    status: inserted.length > 0 ? 'reported' : 'already_reported',
    bestJaccard,
    reportsFiled: inserted.length,
  };
}

interface PublishedRef {
  id: string;
  publishedAt: Date | null;
}

/**
 * `[probable copy, original]`: the later published chapter is the copy. Ties (and a missing time,
 * which a published chapter never has) fall back to the id, so both directions agree.
 */
function orderByPublishTime(a: PublishedRef, b: PublishedRef): [PublishedRef, PublishedRef] {
  const at = a.publishedAt?.getTime() ?? 0;
  const bt = b.publishedAt?.getTime() ?? 0;
  if (at !== bt) return at > bt ? [a, b] : [b, a];
  return a.id > b.id ? [a, b] : [b, a];
}

const pairKey = (targetId: string, matchedId: string) => `${targetId}:${matchedId}`;

/**
 * Pairs a moderator already dismissed, so a lightly edited republish of the same copy does not
 * come back. A match with a different chapter is still reported.
 */
async function dismissedPairs(db: Db, targetIds: string[]): Promise<Set<string>> {
  const rows = await db
    .select({ targetId: reports.targetId, detail: reports.detail })
    .from(reports)
    .where(
      and(
        eq(reports.targetType, 'chapter'),
        inArray(reports.targetId, targetIds),
        eq(reports.reason, DUPLICATE_REASON),
        eq(reports.status, 'dismissed'),
        isNull(reports.reporterId),
      ),
    );
  const pairs = new Set<string>();
  for (const row of rows) {
    const parsed = duplicateReportDetail.safeParse(parseJson(row.detail));
    if (parsed.success) pairs.add(pairKey(row.targetId, parsed.data.matchedChapterId));
  }
  return pairs;
}

function parseJson(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
