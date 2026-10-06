/**
 * Hợp đồng hàng đợi dùng chung giữa producer (web) và worker: tên queue, tên job và
 * schema payload. Hai phía đều parse payload bằng Zod.
 */
import { z } from 'zod';

export const QUEUES = {
  mail: 'mail',
  /** Side effects of content changes (CDN purge, search sync, fingerprints), fed by the outbox. */
  content: 'content',
  /** Internal periodic jobs only, so slow I/O on `content` never delays scheduled publishing. */
  publishing: 'publishing',
  /** Heavy periodic housekeeping (pruning, recomputing), one job at a time, off `publishing`. */
  maintenance: 'maintenance',
} as const;

/** Repeatable jobs on the `publishing` queue. BullMQ forbids `:` in scheduler ids, hence `-`. */
export const PUBLISHING_JOBS = {
  sweepScheduledChapters: 'sweep-scheduled-chapters',
  drainContentEvents: 'drain-content-events',
  /** Moves the Redis view counters into `chapter_daily_stats`. */
  flushViewCounters: 'flush-view-counters',
  /** Enqueues `fingerprint-chapter` for published chapters whose fingerprint is missing or stale. */
  backfillFingerprints: 'backfill-fingerprints',
} as const;

export type PublishingJobName = (typeof PUBLISHING_JOBS)[keyof typeof PUBLISHING_JOBS];

/** Repeatable jobs on the `maintenance` queue. */
export const MAINTENANCE_JOBS = {
  /** Deletes old notifications in batches. */
  pruneNotifications: 'prune-notifications',
  /** Recomputes the ranking sorted sets in Redis from `story_daily_stats`. */
  recomputeRankings: 'recompute-rankings',
} as const;

export type MaintenanceJobName = (typeof MAINTENANCE_JOBS)[keyof typeof MAINTENANCE_JOBS];

/**
 * Jobs on the `content` queue, each with its own payload schema. Payloads carry ids only and
 * every processor re-reads the current state, because the outbox delivers at least once.
 */
export const CONTENT_JOBS = {
  /** Purges the CDN copies of the public pages a change touches; payload is the change itself. */
  purgeUrls: 'purge-urls',
  /** Re-reads a story (or a user's author doc and stories) and upserts or deletes its search docs. */
  searchSync: 'search-sync',
  /** Fingerprints a published chapter and files an automatic report when it copies another author. */
  fingerprintChapter: 'fingerprint-chapter',
  /** Creates or bumps the "new chapter" notification of the followers of a chapter's story and author. */
  notifyFollowers: 'notify-followers',
} as const;

export type ContentJobName = (typeof CONTENT_JOBS)[keyof typeof CONTENT_JOBS];

export const fingerprintChapterPayload = z.object({ chapterId: z.uuid() });

export type FingerprintChapterPayload = z.infer<typeof fingerprintChapterPayload>;

export const notifyFollowersPayload = z.object({ chapterId: z.uuid() });

export type NotifyFollowersPayload = z.infer<typeof notifyFollowersPayload>;

/**
 * `reports.detail` of an automatic duplicate report. Internal ids only: the moderation API maps
 * `matchedChapterId` to a public URL before showing it.
 */
export const duplicateReportDetail = z.object({
  matchedChapterId: z.uuid(),
  /** Estimated Jaccard similarity of the two chapters' shingle sets, 0–1. */
  jaccard: z.number().min(0).max(1),
  /** Hamming distance of the two SimHashes, 0–64; small means near-identical text. */
  hamming: z.number().int().min(0).max(64),
});

export type DuplicateReportDetail = z.infer<typeof duplicateReportDetail>;

export const MAIL_JOBS = {
  sendAuthEmail: 'send-auth-email',
} as const;

export type MailJobName = (typeof MAIL_JOBS)[keyof typeof MAIL_JOBS];

/** Mail xác thực email (`verify`) hoặc đặt lại mật khẩu (`reset`). `url` chứa token. */
export const sendAuthEmailPayload = z.object({
  kind: z.enum(['verify', 'reset']),
  to: z.email(),
  displayName: z.string(),
  url: z.url(),
});

export type SendAuthEmailPayload = z.infer<typeof sendAuthEmailPayload>;
