/**
 * Content limits shared by the API (Zod) and the forms. Values are the starting points from the
 * spec; change them here only.
 */
export const LIMITS = {
  storyTitle: { min: 2, max: 150 },
  storySynopsisMax: 3_000,
  chapterTitleMax: 150,
  authorNoteMax: 1_000,
  chapterWords: { min: 300, max: 20_000 },
  /** Total tags per story, main tag included. */
  storyTagsMax: 10,
  cover: {
    maxBytes: 5 * 1024 * 1024,
    minWidth: 600,
    minHeight: 900,
    variants: [
      { width: 600, height: 900 },
      { width: 300, height: 450 },
    ],
  },
  avatar: { maxBytes: 2 * 1024 * 1024, size: 256 },
  revisionsKept: 20,
  /** A scheduled publish time must be at least 5 minutes and at most 365 days ahead. */
  schedule: { minLeadMs: 5 * 60_000, maxAheadMs: 365 * 86_400_000 },
  /** Request body cap for saving a draft; about 20,000 words of JSON with plenty of headroom. */
  draftMaxBytes: 2_000_000,
  /** Free-text description a reader adds to a report. */
  reportDetailMax: 1_000,
  /** Free-text note a moderator adds to an action. */
  modNoteMax: 500,
} as const;

/**
 * Duplicate check parameters (spec section 7). `shingle`, `perms`, `bands` and `rows` shape the
 * stored fingerprints: changing them makes every stored fingerprint meaningless (clear
 * `chapter_fingerprints` and let the backfill recompute). With 16 bands of 8 rows a pair with
 * Jaccard 0.8 becomes a candidate ~95% of the time, 0.5 only ~6%; `jaccard` is the final filter.
 */
export const DEDUPE = {
  /** Words per shingle. */
  shingle: 5,
  /** MinHash permutations; equals `bands * rows`. */
  perms: 128,
  bands: 16,
  rows: 8,
  /** Estimated Jaccard similarity at or above which an automatic report is filed. */
  jaccard: 0.7,
  /** Below this many shingles a chapter is fingerprinted but never compared (too little text). */
  minShingles: 20,
  maxCandidates: 200,
  backfillBatch: 500,
  /** Batches per backfill run, so one run enqueues at most 5,000 jobs. */
  backfillMaxBatches: 10,
} as const;

/** Image types accepted for upload (checked again from magic bytes on the server). */
export const COVER_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
