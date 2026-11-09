import { type Db, type userRole, users } from '@novel-hub/db';
import { eq } from 'drizzle-orm';
import { type Result, err, ok } from '../lib/result';

export type UserRoleValue = (typeof userRole.enumValues)[number];

export interface SetUserRoleInput {
  username: string;
  role: UserRoleValue;
}

export interface SetUserRoleOutput {
  id: string;
  username: string;
  previousRole: UserRoleValue;
  role: UserRoleValue;
}

/**
 * Changes a user's role. Better Auth refuses client-supplied roles, so operators promote
 * moderators and admins through this function (via the CLI). `status` is left untouched.
 * The row is locked while the previous role is read so the reported change is accurate.
 */
export async function setUserRole(
  db: Pick<Db, 'transaction'>,
  input: SetUserRoleInput,
): Promise<Result<SetUserRoleOutput, 'USER_NOT_FOUND'>> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ id: users.id, username: users.username, role: users.role })
      .from(users)
      .where(eq(users.username, input.username))
      .for('update');
    if (!current) return err('USER_NOT_FOUND');

    await tx.update(users).set({ role: input.role }).where(eq(users.id, current.id));
    return ok({
      id: current.id,
      username: current.username,
      previousRole: current.role,
      role: input.role,
    });
  });
}
