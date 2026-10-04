import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { chapters } from './chapters';
import { createdAt, timestamptz, updatedAt, uuidPk } from './columns';
import { libraryShelf } from './enums';
import { stories } from './stories';

/** Tủ truyện. */
export const libraryItems = pgTable(
  'library_items',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    storyId: uuid()
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    shelf: libraryShelf().notNull(),
    addedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'library_items_pkey', columns: [t.userId, t.storyId] }),
    index('library_items_story_id_idx').on(t.storyId),
  ],
);

/** Đọc tiếp; cũng là nguồn cho thống kê bỏ dở. */
export const readingProgress = pgTable(
  'reading_progress',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    storyId: uuid()
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    chapterId: uuid()
      .notNull()
      .references(() => chapters.id, { onDelete: 'cascade' }),
    scrollPct: real().notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'reading_progress_pkey', columns: [t.userId, t.storyId] }),
    check('reading_progress_scroll_pct_range', sql`${t.scrollPct} BETWEEN 0 AND 100`),
    index('reading_progress_user_id_updated_at_idx').on(t.userId, t.updatedAt.desc()),
    index('reading_progress_story_id_idx').on(t.storyId),
    index('reading_progress_chapter_id_idx').on(t.chapterId),
  ],
);

/** Worker ghi dồn từ counter Redis mỗi 5 phút. */
export const chapterDailyStats = pgTable(
  'chapter_daily_stats',
  {
    chapterId: uuid()
      .notNull()
      .references(() => chapters.id, { onDelete: 'cascade' }),
    date: date({ mode: 'string' }).notNull(),
    views: integer().notNull().default(0),
    uniqueReaders: integer().notNull().default(0),
    completions: integer().notNull().default(0),
  },
  (t) => [primaryKey({ name: 'chapter_daily_stats_pkey', columns: [t.chapterId, t.date] })],
);

export const badges = pgTable(
  'badges',
  {
    id: uuidPk(),
    code: text().notNull(),
    name: text().notNull(),
    description: text(),
    createdAt: createdAt(),
  },
  (t) => [unique('badges_code_key').on(t.code)],
);

export const userBadges = pgTable(
  'user_badges',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    badgeId: uuid()
      .notNull()
      .references(() => badges.id, { onDelete: 'cascade' }),
    awardedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'user_badges_pkey', columns: [t.userId, t.badgeId] }),
    index('user_badges_badge_id_idx').on(t.badgeId),
  ],
);
