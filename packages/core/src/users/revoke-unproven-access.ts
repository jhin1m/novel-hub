import { type Db, accounts, sessions } from '@novel-hub/db';
import { eq } from 'drizzle-orm';

/**
 * Gọi khi email được xác thực lần đầu: xoá mọi session và cách đăng nhập (mật khẩu,
 * OAuth) có từ trước khi chứng minh sở hữu email.
 *
 * Chống chiếm tài khoản trước: kẻ xấu đăng ký bằng email người khác rồi chờ chủ email bấm
 * link xác thực. Sau bước này chỉ người bấm link (được tự đăng nhập) giữ quyền truy cập;
 * muốn đăng nhập bằng mật khẩu thì dùng "quên mật khẩu".
 */
export async function revokeUnprovenAccess(db: Db, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx.delete(accounts).where(eq(accounts.userId, userId));
  });
}
