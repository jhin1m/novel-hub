import { type Db, users } from '@novel-hub/db';
import { eq } from 'drizzle-orm';

/** Đánh dấu email đã xác thực (đặt lại mật khẩu thành công cũng chứng minh sở hữu email). */
export async function markEmailVerified(db: Pick<Db, 'update'>, userId: string): Promise<void> {
  await db.update(users).set({ emailVerified: true }).where(eq(users.id, userId));
}
