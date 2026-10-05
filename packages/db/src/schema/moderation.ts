import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { createdAt, timestamptz, uuidPk } from './columns';
import { stories } from './stories';

/** Hàng chờ kiểm duyệt. Báo cáo tự động (trùng lặp) không có người báo. */
export const reports = pgTable(
  'reports',
  {
    id: uuidPk(),
    reporterId: uuid().references(() => users.id, { onDelete: 'set null' }),
    targetType: text().notNull(),
    targetId: uuid().notNull(),
    reason: text().notNull(),
    detail: text(),
    status: text().notNull().default('open'),
    handledBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    index('reports_status_created_at_idx').on(t.status, t.createdAt),
    index('reports_target_idx').on(t.targetType, t.targetId),
    index('reports_reporter_id_idx').on(t.reporterId),
    index('reports_handled_by_idx').on(t.handledBy),
    // At most one open automatic report per target and reason, so repeated or concurrent
    // duplicate checks insert with `ON CONFLICT DO NOTHING`.
    uniqueIndex('reports_open_auto_key')
      .on(t.targetType, t.targetId, t.reason)
      .where(sql`${t.status} = 'open' AND ${t.reporterId} IS NULL`),
  ],
);

/** Nhật ký mọi hành động của mod; không xoá theo user. */
export const moderationActions = pgTable(
  'moderation_actions',
  {
    id: uuidPk(),
    modId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    targetType: text().notNull(),
    targetId: uuid().notNull(),
    action: text().notNull(),
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index('moderation_actions_target_idx').on(t.targetType, t.targetId),
    index('moderation_actions_mod_id_idx').on(t.modId),
  ],
);

/** Truyện nổi bật do mod chọn. */
export const featuredSlots = pgTable(
  'featured_slots',
  {
    id: uuidPk(),
    storyId: uuid()
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    slot: text().notNull(),
    startsAt: timestamptz().notNull(),
    endsAt: timestamptz().notNull(),
  },
  (t) => [
    check('featured_slots_time_range', sql`${t.endsAt} > ${t.startsAt}`),
    index('featured_slots_slot_starts_at_idx').on(t.slot, t.startsAt),
    index('featured_slots_story_id_idx').on(t.storyId),
  ],
);
