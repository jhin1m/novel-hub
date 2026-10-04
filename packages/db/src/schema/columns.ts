import { sql } from 'drizzle-orm';
import { timestamp, uuid } from 'drizzle-orm/pg-core';

/** Khoá chính UUIDv7 sinh ở DB (Postgres 18), nên insert bằng SQL thô cũng có id. */
export const uuidPk = () =>
  uuid()
    .primaryKey()
    .default(sql`uuidv7()`);

/** `timestamptz` cho mọi mốc thời gian (spec mục 4). */
export const timestamptz = () => timestamp({ withTimezone: true });

export const createdAt = () => timestamptz().notNull().defaultNow();

/** Drizzle tự đặt lại khi update qua ORM; SQL thô phải tự đặt. */
export const updatedAt = () =>
  timestamptz()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
