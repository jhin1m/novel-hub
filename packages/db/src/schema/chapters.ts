import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, timestamptz, updatedAt, uuidPk } from './columns';
import { chapterStatus } from './enums';
import { stories } from './stories';

/** Metadata chương; nội dung nằm ở `chapter_contents` (đã đăng) và `chapter_drafts`. */
export const chapters = pgTable(
  'chapters',
  {
    id: uuidPk(),
    storyId: uuid()
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    /** Gán tăng dần khi tạo, không đổi sau khi đăng (URL phụ thuộc vào nó). */
    number: integer().notNull(),
    title: text(),
    authorNote: text(),
    wordCount: integer().notNull().default(0),
    status: chapterStatus().notNull().default('draft'),
    publishedAt: timestamptz(),
    scheduledAt: timestamptz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    /** Xoá mềm: số chương để trống, không đánh số lại. */
    deletedAt: timestamptz(),
  },
  (t) => [
    // Không lọc `deleted_at`: số của chương đã xoá mềm không được dùng lại.
    unique('chapters_story_id_number_key').on(t.storyId, t.number),
    check('chapters_number_positive', sql`${t.number} > 0`),
    index('chapters_story_id_status_number_idx').on(t.storyId, t.status, t.number),
    index('chapters_scheduled_at_idx')
      .on(t.scheduledAt)
      .where(sql`${t.status} = 'scheduled'`),
  ],
);

export const chapterContents = pgTable('chapter_contents', {
  chapterId: uuid()
    .primaryKey()
    .references(() => chapters.id, { onDelete: 'cascade' }),
  docJson: jsonb().notNull(),
  /** HTML đã sanitize, mỗi đoạn có `data-pid` ổn định. */
  html: text().notNull(),
  paragraphIds: text().array().notNull(),
  contentHash: text().notNull(),
});

/** Autosave ghi đè vào đây. */
export const chapterDrafts = pgTable('chapter_drafts', {
  chapterId: uuid()
    .primaryKey()
    .references(() => chapters.id, { onDelete: 'cascade' }),
  docJson: jsonb().notNull(),
  updatedAt: updatedAt(),
});

export const chapterRevisions = pgTable(
  'chapter_revisions',
  {
    id: uuidPk(),
    chapterId: uuid()
      .notNull()
      .references(() => chapters.id, { onDelete: 'cascade' }),
    docJson: jsonb().notNull(),
    wordCount: integer().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('chapter_revisions_chapter_id_created_at_idx').on(t.chapterId, t.createdAt.desc())],
);

/** Dấu vân tay nội dung cho kiểm tra trùng lặp (spec mục 7). */
export const chapterFingerprints = pgTable(
  'chapter_fingerprints',
  {
    chapterId: uuid()
      .primaryKey()
      .references(() => chapters.id, { onDelete: 'cascade' }),
    minhash: integer().array().notNull(),
    simhash: bigint({ mode: 'bigint' }).notNull(),
    /** One key per LSH band of `minhash`; candidates share at least one key (`&&` on the GIN). */
    lshKeys: integer()
      .array()
      .notNull()
      .default(sql`'{}'`),
    /** `chapter_contents.content_hash` the fingerprint was computed from; stale when it differs. */
    contentHash: text(),
  },
  (t) => [index('chapter_fingerprints_lsh_keys_idx').using('gin', t.lshKeys)],
);
