import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { createdAt, timestamptz, updatedAt, uuidPk } from './columns';
import { stories } from './stories';

/**
 * Themed contests run by moderators. No stored status: upcoming / open / ended is derived from
 * `starts_at` and `ends_at`. `slug` is unique and never changes when the title does (stable URL).
 */
export const contests = pgTable(
  'contests',
  {
    id: uuidPk(),
    slug: text().notNull().unique('contests_slug_key'),
    title: text().notNull(),
    /** Plain text (theme and rules), normalised before insert; rendered as text, never as HTML. */
    description: text().notNull(),
    startsAt: timestamptz().notNull(),
    endsAt: timestamptz().notNull(),
    createdBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('contests_time_range', sql`${t.endsAt} > ${t.startsAt}`),
    index('contests_ends_at_idx').on(t.endsAt),
  ],
);

/** Contest entries: stories their authors entered; `placement` 1–3 is set by a moderator once ended. */
export const contestEntries = pgTable(
  'contest_entries',
  {
    contestId: uuid()
      .notNull()
      .references(() => contests.id, { onDelete: 'cascade' }),
    storyId: uuid()
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    placement: smallint(),
  },
  (t) => [
    primaryKey({ name: 'contest_entries_pkey', columns: [t.contestId, t.storyId] }),
    check(
      'contest_entries_placement_range',
      sql`${t.placement} IS NULL OR ${t.placement} BETWEEN 1 AND 3`,
    ),
    // One story per placement in a contest.
    uniqueIndex('contest_entries_placement_key')
      .on(t.contestId, t.placement)
      .where(sql`${t.placement} IS NOT NULL`),
    // A contest's entries, newest first.
    index('contest_entries_contest_created_idx').on(t.contestId, t.createdAt),
    // The contests a story entered (CDN purge).
    index('contest_entries_story_id_idx').on(t.storyId),
  ],
);
