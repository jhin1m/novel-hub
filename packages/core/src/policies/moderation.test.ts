import { describe, expect, it } from 'vitest';
import { canModerate, canModerateUser } from './moderation';
import type { PolicyUser, UserRole, UserStatus } from './user';

const ROLES: UserRole[] = ['reader', 'author', 'mod', 'admin'];
const STATUSES: UserStatus[] = ['active', 'muted', 'banned'];

const user = (role: UserRole, status: UserStatus = 'active', id = 'actor') => ({
  id,
  role,
  status,
  emailVerified: true,
});

describe('canModerate', () => {
  it('allows only active moderators and admins', () => {
    for (const role of ROLES) {
      for (const status of STATUSES) {
        const actor: PolicyUser = user(role, status);
        const expected = (role === 'mod' || role === 'admin') && status === 'active';
        expect(canModerate(actor), `${role}/${status}`).toBe(expected);
      }
    }
  });
});

describe('canModerateUser', () => {
  it('follows the role table: mods act on readers and authors, admins also on mods', () => {
    const expected: Record<UserRole, Record<UserRole, boolean>> = {
      reader: { reader: false, author: false, mod: false, admin: false },
      author: { reader: false, author: false, mod: false, admin: false },
      mod: { reader: true, author: true, mod: false, admin: false },
      admin: { reader: true, author: true, mod: true, admin: false },
    };
    for (const actorRole of ROLES) {
      for (const targetRole of ROLES) {
        expect(
          canModerateUser(user(actorRole), { id: 'target', role: targetRole }),
          `${actorRole} → ${targetRole}`,
        ).toBe(expected[actorRole][targetRole]);
      }
    }
  });

  it('never lets anyone act on themselves, nor an inactive moderator act at all', () => {
    expect(canModerateUser(user('admin'), { id: 'actor', role: 'admin' })).toBe(false);
    expect(canModerateUser(user('mod'), { id: 'actor', role: 'mod' })).toBe(false);
    expect(canModerateUser(user('mod', 'muted'), { id: 'target', role: 'reader' })).toBe(false);
    expect(canModerateUser(user('admin', 'banned'), { id: 'target', role: 'reader' })).toBe(false);
  });
});
