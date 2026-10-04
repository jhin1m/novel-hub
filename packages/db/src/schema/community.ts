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
    /** Để sẵn cho bình luận theo đoạn (`data-pid`). */
    paragraphId: text(),
    body: text().notNull(),
    status: text().notNull().default('visible'),
    createdAt: createdAt(),
  },
  (t) => [
    index('comments_chapter_id_created_at_idx').on(t.chapterId, t.createdAt),
    index('comments_parent_id_idx').on(t.parentId),
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
    readAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_user_id_created_at_idx').on(t.userId, t.createdAt.desc())],
);
