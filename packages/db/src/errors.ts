/**
 * Message lỗi an toàn để in ra log của CLI. Drizzle bọc lỗi Postgres trong `cause`, và
 * message của lớp bọc chứa cả câu SQL lẫn tham số (có thể là hash mật khẩu), nên chỉ lấy
 * message của lỗi gốc.
 */
export function describeDbError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  return err.cause instanceof Error ? err.cause.message : err.message;
}
