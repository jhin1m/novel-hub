import { type Db, type Tx, contentEvents } from '@novel-hub/db';
import { type ContentJobName, QUEUES } from '@novel-hub/shared';
import { Queue } from 'bullmq';
import { and, asc, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { logRedisErrors } from '../infra/redis';
import { withTimeout } from '../lib/with-timeout';
import { DEFAULT_JOB_OPTIONS } from '../queue/job-options';
import { type ContentChange, type ContentJob, contentChangeSchema, jobsForChange } from './hooks';

/**
 * Writes changes to the outbox. Must run inside the transaction that made the change, so the
 * event commits (or rolls back) with it. Payloads are validated here, at the source.
 */
export async function recordContentChanges(
  tx: Db | Tx,
  changes: readonly ContentChange[],
): Promise<void> {
  if (changes.length === 0) return;
  const payloads = changes.map((change) => contentChangeSchema.parse(change));
  await tx.insert(contentEvents).values(payloads.map((payload) => ({ payload })));
}

export type ContentQueue = Queue<unknown, void, ContentJobName>;

/** Producer side of the `content` queue (the worker drains the outbox into it). */
export function createContentQueue(connection: Redis, prefix: string): ContentQueue {
  const queue: ContentQueue = new Queue(QUEUES.content, {
    connection,
    prefix,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  logRedisErrors(connection, `[queue:${QUEUES.content}]`, queue);
  return queue;
}

const ADD_BULK_TIMEOUT_MS = 10_000;
const PROCESSED_RETENTION = sql`interval '7 days'`;

export interface DrainContentEventsDeps {
  db: Db;
  contentQueue: Pick<ContentQueue, 'addBulk'>;
  /** Defaults to `jobsForChange`; tests swap in a mapping that actually produces jobs. */
  mapChange?: (change: ContentChange) => ContentJob[];
  batchSize?: number;
  maxBatches?: number;
}

export interface DrainResult {
  /** Events handed to the queue (or needing no job) and marked processed. */
  enqueued: number;
  /** Events left pending because the queue refused them; retried on the next tick. */
  failed: number;
}

/**
 * One drain tick. Each batch is one transaction: pending events are locked with `SKIP LOCKED`
 * (two drains never take the same event), turned into jobs, added in bulk, then marked processed.
 * When Redis refuses or hangs, the batch's attempts are bumped and the tick stops; the events stay
 * pending for the next tick. A crash between `addBulk` and the commit re-enqueues the batch, which
 * is why every content job must be idempotent.
 */
export async function drainContentEvents(deps: DrainContentEventsDeps): Promise<DrainResult> {
  const mapChange = deps.mapChange ?? jobsForChange;
  const batchSize = deps.batchSize ?? 100;
  const maxBatches = deps.maxBatches ?? 10;
  const result: DrainResult = { enqueued: 0, failed: 0 };

  for (let batch = 0; batch < maxBatches; batch++) {
    const outcome = await deps.db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: contentEvents.id, payload: contentEvents.payload })
        .from(contentEvents)
        .where(isNull(contentEvents.processedAt))
        .orderBy(asc(contentEvents.id))
        .limit(batchSize)
        .for('update', { skipLocked: true });

      const validIds: string[] = [];
      const invalidIds: string[] = [];
      const unmappedIds: string[] = [];
      const jobs: ContentJob[] = [];
      for (const row of rows) {
        const parsed = contentChangeSchema.safeParse(row.payload);
        if (!parsed.success) {
          // Marked processed: a payload that fails the schema now fails it on every retry too.
          console.error(`[outbox] dropping malformed content event ${row.id}`);
          invalidIds.push(row.id);
          continue;
        }
        let mapped: ContentJob[];
        try {
          mapped = mapChange(parsed.data);
        } catch (error) {
          // Only this event waits for the next tick; the rest of the batch goes through.
          console.error(
            `[outbox] could not map content event ${row.id}:`,
            error instanceof Error ? error.message : error,
          );
          unmappedIds.push(row.id);
          continue;
        }
        validIds.push(row.id);
        jobs.push(...mapped);
      }
      if (unmappedIds.length > 0) {
        await tx
          .update(contentEvents)
          .set({ attempts: sql`${contentEvents.attempts} + 1` })
          .where(inArray(contentEvents.id, unmappedIds));
      }
      if (invalidIds.length > 0) {
        await tx
          .update(contentEvents)
          .set({ processedAt: sql`now()` })
          .where(inArray(contentEvents.id, invalidIds));
      }
      if (validIds.length === 0) return { rows: rows.length, enqueued: 0, failed: 0 };

      try {
        if (jobs.length > 0) {
          await withTimeout(
            deps.contentQueue.addBulk(jobs),
            ADD_BULK_TIMEOUT_MS,
            'content addBulk',
          );
        }
      } catch (error) {
        console.error(
          `[outbox] could not enqueue ${jobs.length} jobs for ${validIds.length} events:`,
          error instanceof Error ? error.message : error,
        );
        await tx
          .update(contentEvents)
          .set({ attempts: sql`${contentEvents.attempts} + 1` })
          .where(inArray(contentEvents.id, validIds));
        return { rows: rows.length, enqueued: 0, failed: validIds.length };
      }
      await tx
        .update(contentEvents)
        .set({ processedAt: sql`now()` })
        .where(inArray(contentEvents.id, validIds));
      return { rows: rows.length, enqueued: validIds.length, failed: 0 };
    });

    result.enqueued += outcome.enqueued;
    result.failed += outcome.failed;
    if (outcome.failed > 0 || outcome.rows < batchSize) break;
  }

  await deps.db
    .delete(contentEvents)
    .where(
      and(
        isNotNull(contentEvents.processedAt),
        lt(contentEvents.processedAt, sql`now() - ${PROCESSED_RETENTION}`),
      ),
    );
  return result;
}
