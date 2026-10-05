import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable } from 'drizzle-orm/pg-core';
import { createdAt, timestamptz, uuidPk } from './columns';

/**
 * Transactional outbox: every public content change is written here in the same transaction as
 * the change itself, then the worker turns it into queue jobs (CDN purge, search sync...). A
 * commit can therefore never lose its side effects, even when Redis is down at that moment.
 */
export const contentEvents = pgTable(
  'content_events',
  {
    // UUIDv7 ids are time-ordered, so `ORDER BY id` drains in commit order (near enough).
    id: uuidPk(),
    payload: jsonb().notNull(),
    createdAt: createdAt(),
    processedAt: timestamptz(),
    attempts: integer().notNull().default(0),
  },
  (t) => [
    index('content_events_pending_idx')
      .on(t.id)
      .where(sql`processed_at is null`),
  ],
);
