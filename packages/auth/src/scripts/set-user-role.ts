// `pnpm user:set-role -- --username <u> --role <role> [--yes]`: promotes or demotes an account.
// Better Auth refuses client-supplied roles, so this is the only way to create mods and admins.
// Allowed in production, where `--yes` confirms the target database.
import { setUserRole } from '@novel-hub/core';
import { createDb } from '@novel-hub/db';
import { describeDbError } from '@novel-hub/db/seed';
import { dbEnvSchema, loadServerEnv } from '@novel-hub/shared/env';
import { USAGE, describeDatabaseTarget, parseSetUserRoleArgs } from './set-user-role-args';

try {
  const args = parseSetUserRoleArgs(process.argv.slice(2));
  const { DATABASE_URL } = loadServerEnv(dbEnvSchema);
  const target = describeDatabaseTarget(DATABASE_URL);
  console.log(`[set-user-role] database: ${target}`);

  if (process.env.NODE_ENV === 'production' && !args.yes) {
    throw new Error(`refusing to change a role in production without --yes (target ${target})`);
  }

  const { db, pool } = createDb(DATABASE_URL, { max: 1 });
  try {
    const result = await setUserRole(db, { username: args.username, role: args.role });
    if (!result.ok) {
      throw new Error(`user "${args.username}" not found`);
    }
    const { username, previousRole, role } = result.value;
    console.log(`[set-user-role] ${username}: ${previousRole} -> ${role}`);
  } finally {
    await pool.end();
  }
} catch (err) {
  console.error('[set-user-role] failed:', describeDbError(err));
  console.error(USAGE);
  process.exitCode = 1;
}
