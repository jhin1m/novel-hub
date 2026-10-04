import { sql } from 'drizzle-orm';
import type { Db } from './client';

/**
 * TRUNCATE mọi bảng trong schema `public` (bảng migration nằm ở schema `drizzle`).
 * Không tự kiểm tra an toàn: chỉ gọi sau `truncateAll` (DB `_test`) hoặc guard của seed.
 */
export async function truncatePublicTables(db: Pick<Db, 'execute'>): Promise<void> {
  const { rows } = await db.execute<{ table_name: string }>(sql`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
  `);
  if (rows.length === 0) return;
  const tables = sql.join(
    rows.map((r) => sql`${sql.identifier('public')}.${sql.identifier(r.table_name)}`),
    sql`, `,
  );
  await db.execute(sql`truncate table ${tables} restart identity cascade`);
}
