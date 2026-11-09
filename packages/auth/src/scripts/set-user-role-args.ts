import { parseArgs } from 'node:util';
import { userRole } from '@novel-hub/db';
import { USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH, USERNAME_PATTERN } from '@novel-hub/shared';
import { z } from 'zod';

const argsSchema = z.object({
  username: z
    .string()
    .min(USERNAME_MIN_LENGTH)
    .max(USERNAME_MAX_LENGTH)
    .regex(USERNAME_PATTERN, 'only a-z, 0-9 and _ are allowed'),
  role: z.enum(userRole.enumValues),
  yes: z.boolean(),
});

export type SetUserRoleArgs = z.infer<typeof argsSchema>;

export const USAGE = `Usage: pnpm user:set-role --username <username> --role <${userRole.enumValues.join('|')}> [--yes]
  --yes  required when NODE_ENV=production (confirms the target database is the intended one)`;

/** Parses and validates CLI arguments; throws a readable Error on any problem. */
export function parseSetUserRoleArgs(argv: string[]): SetUserRoleArgs {
  const { values } = parseArgs({
    // pnpm forwards the `--` separator of `pnpm user:set-role -- --flag` to the script.
    args: argv[0] === '--' ? argv.slice(1) : argv,
    options: {
      username: { type: 'string' },
      role: { type: 'string' },
      yes: { type: 'boolean', default: false },
    },
    strict: true,
  });
  const parsed = argsSchema.safeParse(values);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'args'}: ${issue.message}`)
      .join('; ');
    throw new Error(`invalid arguments (${issues})`);
  }
  return parsed.data;
}

/** `host:port/dbname` of the target database, never including credentials. */
export function describeDatabaseTarget(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  return `${url.host}${url.pathname}`;
}
