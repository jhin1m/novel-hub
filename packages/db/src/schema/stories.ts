import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { createdAt, timestamptz, updatedAt, uuidPk } from './columns';
import { storyStatus, storyVisibility, tagKind } from './enums';

export const tags = pgTable(
  'tags',
  {
    id: uuidPk(),
    slug: text().notNull(),
    name: text().notNull(),
    kind: tagKind().notNull(),
    /** Tag bị gộp trỏ về tag chuẩn; URL tag cũ redirect 301 sang tag chuẩn. */
    canonicalId: uuid().references((): AnyPgColumn => tags.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    unique('tags_slug_key').on(t.slug),
    check('tags_canonical_not_self', sql`${t.canonicalId} <> ${t.id}`),
    index('tags_canonical_id_idx').on(t.canonicalId),
  ],
);

export const stories = pgTable(
  'stories',
  {
    id: uuidPk(),
    /** Mã ngắn ngẫu nhiên trong URL; trùng thì sinh lại (bắt lỗi `stories_public_id_key`). */
    publicId: varchar({ length: 8 }).notNull(),
    slug: text().notNull(),
    authorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    title: text().notNull(),
    synopsis: text().notNull().default(''),
    coverUrl: text(),
    /** Tag chính (kind = genre): thẻ truyện và màu bìa mặc định. */
    mainTagId: uuid()
      .notNull()
      .references(() => tags.id, { onDelete: 'restrict' }),
    status: storyStatus().notNull().default('ongoing'),
    visibility: storyVisibility().notNull().default('draft'),
    isAiAssisted: boolean().notNull().default(false),
    isMature: boolean().notNull().default(false),
    // Bộ đếm chỉ tính chương đã đăng và chưa xoá mềm.
    wordCount: integer().notNull().default(0),
    chapterCount: integer().notNull().default(0),
    lastChapterAt: timestamptz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('stories_public_id_key').on(t.publicId),
    index('stories_author_id_idx').on(t.authorId),
    // Index là `DESC NULLS LAST`; truy vấn phải viết `desc nulls last` (helper `desc()` của
    // Drizzle sinh NULLS FIRST, Postgres sẽ phải sort thêm).
    index('stories_visibility_last_chapter_at_idx').on(t.visibility, t.lastChapterAt.desc()),
    index('stories_main_tag_id_idx').on(t.mainTagId),
  ],
);

export const storyTags = pgTable(
  'story_tags',
  {
    storyId: uuid()
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    tagId: uuid()
      .notNull()
      .references(() => tags.id, { onDelete: 'restrict' }),
  },
  (t) => [
    primaryKey({ name: 'story_tags_pkey', columns: [t.storyId, t.tagId] }),
    index('story_tags_tag_id_idx').on(t.tagId),
  ],
);
