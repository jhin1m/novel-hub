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
} as const;

/** Repeatable jobs on the `publishing` queue. BullMQ forbids `:` in scheduler ids, hence `-`. */
export const PUBLISHING_JOBS = {
  sweepScheduledChapters: 'sweep-scheduled-chapters',
  drainContentEvents: 'drain-content-events',
  /** Moves the Redis view counters into `chapter_daily_stats`. */
  flushViewCounters: 'flush-view-counters',
} as const;

export type PublishingJobName = (typeof PUBLISHING_JOBS)[keyof typeof PUBLISHING_JOBS];

/**
 * Jobs on the `content` queue, each with its own payload schema. Payloads carry ids only and
 * every processor re-reads the current state, because the outbox delivers at least once.
 */
export const CONTENT_JOBS = {
  /** Purges the CDN copies of the public pages a change touches; payload is the change itself. */
  purgeUrls: 'purge-urls',
  /** Re-reads a story (or a user's author doc and stories) and upserts or deletes its search docs. */
  searchSync: 'search-sync',
} as const;

export type ContentJobName = (typeof CONTENT_JOBS)[keyof typeof CONTENT_JOBS];

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
