import { sql } from 'drizzle-orm';
import { check, date, index, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { createdAt, uuidPk } from './columns';
import { stories } from './stories';

/** Short plain-text notices an author posts to a story's followers (hiatus, schedule changes…). */
export const storyAnnouncements = pgTable(
  'story_announcements',
  {
    id: uuidPk(),
    storyId: uuid()
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    authorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** Plain text, normalised before insert; rendered as text, never as HTML. */
    body: text().notNull(),
    /** `visible` / `deleted` (by its author) / `hidden_by_mod`; values validated in `shared`. */
    status: text().notNull().default('visible'),
    createdAt: createdAt(),
  },
  (t) => [
    check('story_announcements_body_length', sql`char_length(${t.body}) BETWEEN 1 AND 1000`),
    index('story_announcements_story_idx').on(t.storyId, t.createdAt),
    index('story_announcements_author_idx').on(t.authorId, t.createdAt),
  ],
);

/** Free weekly nominations: one per user, story and week; the weekly quota is enforced in core. */
export const storyNominations = pgTable(
  'story_nominations',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    storyId: uuid()
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    /** Monday (Vietnam time) of the week the nomination counts for, `YYYY-MM-DD`. */
    weekStart: date({ mode: 'string' }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'story_nominations_pkey', columns: [t.userId, t.storyId, t.weekStart] }),
    // The weekly board: count per story within one week.
    index('story_nominations_week_story_idx').on(t.weekStart, t.storyId),
    index('story_nominations_story_id_idx').on(t.storyId),
  ],
);
