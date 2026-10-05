/**
 * Integration-test fixtures for moderation: users of any role as `CurrentUser`. Test files only.
 */
import { type Db, users } from '@novel-hub/db';
import type { UserRole } from '../policies/user';
import type { CurrentUser } from '../users/current-user';

export async function makeUser(
  db: Db,
  username: string,
  role: UserRole = 'reader',
): Promise<CurrentUser> {
  const [row] = await db
    .insert(users)
    .values({
      username,
      displayName: `Name ${username}`,
      email: `${username}@example.com`,
      emailVerified: true,
      role,
    })
    .returning();
  if (!row) throw new Error('user insert failed');
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    email: row.email,
    emailVerified: row.emailVerified,
    avatarUrl: row.avatarUrl,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt,
  };
}
