const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export interface SeedGuardInput {
  nodeEnv: string | undefined;
  databaseUrl: string;
}

/**
 * Chỉ cho seed (và `--reset`) khi chắc chắn là máy dev: `NODE_ENV` tường minh là
 * development/test **và** DB ở localhost. Thiếu thông tin thì từ chối. Lỗi không in URL.
 */
export function assertSeedAllowed({ nodeEnv, databaseUrl }: SeedGuardInput): void {
  if (nodeEnv !== 'development' && nodeEnv !== 'test') {
    throw new Error(
      `Từ chối seed: NODE_ENV phải là development hoặc test (hiện tại: ${nodeEnv ?? 'chưa đặt'})`,
    );
  }
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('Từ chối seed: DATABASE_URL không hợp lệ');
  }
  // `pg` lấy `?host=` trong query string thay cho host của URL, nên chỉ đọc hostname là
  // chưa đủ: `postgres://u:p@localhost/db?host=db.prod` thực ra kết nối tới `db.prod`.
  if (url.searchParams.has('host') || url.searchParams.has('hostaddr')) {
    throw new Error('Từ chối seed: DATABASE_URL không được đặt host qua query string');
  }
  const host = url.hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`Từ chối seed: DB không ở localhost (host: ${host || 'trống'})`);
  }
}
