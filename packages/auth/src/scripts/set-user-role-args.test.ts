import { describe, expect, it } from 'vitest';
import { describeDatabaseTarget, parseSetUserRoleArgs } from './set-user-role-args';

describe('parseSetUserRoleArgs', () => {
  it('accepts a valid username and role', () => {
    expect(parseSetUserRoleArgs(['--username', 'alice_1', '--role', 'mod'])).toEqual({
      username: 'alice_1',
      role: 'mod',
      yes: false,
    });
  });

  it('ignores a leading pnpm separator', () => {
    expect(parseSetUserRoleArgs(['--', '--username', 'alice', '--role', 'mod']).username).toBe(
      'alice',
    );
  });

  it('reads the confirmation flag', () => {
    expect(parseSetUserRoleArgs(['--username', 'alice', '--role', 'admin', '--yes']).yes).toBe(
      true,
    );
  });

  it('rejects an unknown role', () => {
    expect(() => parseSetUserRoleArgs(['--username', 'alice', '--role', 'root'])).toThrow(/role/);
  });

  it('rejects a malformed username', () => {
    expect(() => parseSetUserRoleArgs(['--username', 'Alice!', '--role', 'mod'])).toThrow(
      /username/,
    );
  });

  it('rejects missing arguments and unknown flags', () => {
    expect(() => parseSetUserRoleArgs(['--role', 'mod'])).toThrow(/username/);
    expect(() => parseSetUserRoleArgs(['--username', 'alice', '--role', 'mod', '--x'])).toThrow();
  });
});

describe('describeDatabaseTarget', () => {
  it('omits credentials', () => {
    expect(describeDatabaseTarget('postgres://user:secret@db.internal:5432/novel')).toBe(
      'db.internal:5432/novel',
    );
  });
});
