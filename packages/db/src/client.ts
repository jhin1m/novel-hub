import { type NodePgDatabase, drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index';

export type Db = NodePgDatabase<typeof schema>;

export interface CreateDbOptions {
  /** Số kết nối tối đa của pool. Mặc định 10. */
  max?: number;
  /** Thời gian chờ lấy kết nối (ms). Mặc định 5000: Postgres chết thì lỗi nhanh, không treo. */
  connectionTimeoutMillis?: number;
  /**
   * `statement_timeout` của mỗi phiên (ms). Mặc định 15000; `0` = tắt (dùng cho migrate).
   * Client tự huỷ chờ sau thêm 5 giây phòng khi server treo hẳn (timeout phía server không về).
   */
  statementTimeoutMs?: number;
}

/** Biên chờ thêm phía client so với `statement_timeout`, để timeout của server luôn tới trước. */
const QUERY_TIMEOUT_MARGIN_MS = 5_000;

/** Tạo một `Pool` và Drizzle client. Mỗi process chỉ nên gọi một lần; nhớ `pool.end()` khi thoát. */
export function createDb(url: string, opts: CreateDbOptions = {}): { db: Db; pool: pg.Pool } {
  const statementTimeout = opts.statementTimeoutMs ?? 15_000;
  const pool = new pg.Pool({
    connectionString: url,
    max: opts.max ?? 10,
    connectionTimeoutMillis: opts.connectionTimeoutMillis ?? 5_000,
    statement_timeout: statementTimeout,
    query_timeout: statementTimeout > 0 ? statementTimeout + QUERY_TIMEOUT_MARGIN_MS : undefined,
    keepAlive: true,
  });
  // Kết nối bị Postgres cắt (restart, terminate) phát 'error' trên client, kể cả khi đang
  // được dùng trong transaction; không có listener thì cả process crash. Truy vấn đang chờ
  // vẫn bị reject bình thường, nên ở đây chỉ cần log.
  pool.on('connect', (client) => {
    client.on('error', (err) => {
      console.error('[db] kết nối bị đứt:', err.message);
    });
  });
  // Kết nối idle lỗi còn phát thêm trên pool; đã log ở listener của client.
  pool.on('error', () => {});
  const db = drizzle({ client: pool, schema, casing: 'snake_case' });
  return { db, pool };
}
