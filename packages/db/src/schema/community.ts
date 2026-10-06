import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  index,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { chapters } from './chapters';
import { createdAt, timestamptz, uuidPk } from './columns';
import { followTarget } from './enums';
import { stories } from './stories';

/** Theo dõi truyện hoặc tác giả; `target_id` đa hình nên không có FK. */
export const follows = pgTable(
  'follows',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetType: followTarget().notNull(),
    targetId: uuid().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'follows_pkey', columns: [t.userId, t.targetType, t.targetId] }),
    index('follows_target_idx').on(t.targetType, t.targetId),
  ],
);

export const comments = pgTable(
  'comments',
  {
    id: uuidPk(),
    chapterId: uuid()
      .notNull()
      .references(() => chapters.id, { onDelete: 'cascade' }),
    storyId: uuid()
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    parentId: uuid().references((): AnyPgColumn => comments.id),
    /**
     * `data-pid` of the paragraph a thread is about (replies copy their thread's); `null` for the
     * chapter as a whole. Not a reference: a later edit may drop the paragraph, and the comment then
     * shows with the chapter's.
     */
    paragraphId: text(),
    /** Plain text, normalised before insert; rendered as text, never as HTML. */
    body: text().notNull(),
    /** `visible` / `deleted` (by its writer) / `hidden_by_mod`; values validated in `shared`. */
    status: text().notNull().default('visible'),
    createdAt: createdAt(),
  },
  (t) => [
    check('comments_body_length', sql`char_length(${t.body}) BETWEEN 1 AND 2000`),
    // Top-level comments of a chapter, read backwards for newest first (keyset on created_at, id).
    index('comments_chapter_roots_idx')
      .on(t.chapterId, t.createdAt, t.id)
      .where(sql`${t.parentId} IS NULL`),
    // Threads about a paragraph, and the per-paragraph counts.
    index('comments_chapter_paragraph_idx')
      .on(t.chapterId, t.paragraphId)
      .where(sql`${t.paragraphId} IS NOT NULL AND ${t.parentId} IS NULL`),
    // Replies of a thread, oldest first.
    index('comments_parent_idx').on(t.parentId, t.createdAt, t.id),
    index('comments_story_id_idx').on(t.storyId),
    index('comments_user_id_idx').on(t.userId),
  ],
);

/** Mỗi user một đánh giá cho mỗi truyện, thang 1–5. */
export const ratings = pgTable(
  'ratings',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    storyId: uuid()
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    score: smallint().notNull(),
    review: text(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'ratings_pkey', columns: [t.userId, t.storyId] }),
    check('ratings_score_range', sql`${t.score} BETWEEN 1 AND 5`),
    index('ratings_story_id_idx').on(t.storyId),
  ],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuidPk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text().notNull(),
    payload: jsonb()
      .notNull()
      .default(sql`'{}'::jsonb`),
    /**
     * Groups notifications while unread (`story:{id}` for new chapters): a later event updates the
     * unread row with the same key instead of adding one. `null` never groups.
     */
    dedupeKey: text(),
    readAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [
    index('notifications_user_id_created_at_idx').on(t.userId, t.createdAt.desc()),
    // The predicate must stay exactly `read_at IS NULL`: the fan-out's `ON CONFLICT … WHERE`
    // repeats it, and Postgres only picks a partial index whose predicate it can match.
    uniqueIndex('notifications_unread_dedupe_key')
      .on(t.userId, t.dedupeKey)
      .where(sql`${t.readAt} IS NULL`),
    // The bell's unread count.
    index('notifications_unread_idx')
      .on(t.userId)
      .where(sql`${t.readAt} IS NULL`),
  ],
);
