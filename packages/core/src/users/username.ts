import { type Db, users } from '@novel-hub/db';
import { USERNAME_MAX_LENGTH, generatePublicId, usernameSchema } from '@novel-hub/shared';
import { eq } from 'drizzle-orm';

const SUFFIX_LENGTH = 4;
/** Phần gốc tối đa, chừa chỗ cho `_` + hậu tố. */
const BASE_MAX_LENGTH = USERNAME_MAX_LENGTH - SUFFIX_LENGTH - 1;
const FALLBACK_BASE = 'user';

function randomSuffix(): string {
  return generatePublicId().slice(0, SUFFIX_LENGTH);
}

/**
 * Sinh username từ phần trước `@` của email, luôn kèm hậu tố ngẫu nhiên 4 ký tự
 * (`ducanh_k3m9`) để gần như không trùng. Dùng cho user không tự chọn username (Google).
 * Kết quả luôn khớp `usernameSchema`; nơi insert vẫn phải kiểm trùng.
 */
export function generateUsername(email: string, random: () => string = randomSuffix): string {
  const local = email.split('@')[0] ?? '';
  const base =
    local
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .replace(/[đĐ]/g, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .slice(0, BASE_MAX_LENGTH)
      .replace(/^_+|_+$/g, '') || FALLBACK_BASE;
  const candidate = `${base}_${random()}`;
  return usernameSchema.safeParse(candidate).success ? candidate : `${FALLBACK_BASE}_${random()}`;
}

export async function isUsernameTaken(db: Pick<Db, 'select'>, username: string): Promise<boolean> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  return row !== undefined;
}
