import { type PolicyUser, type UserRole, hasAnyRole } from './user';

/** Moderators and admins with an active account; a muted or banned one cannot moderate. */
export function canModerate(user: PolicyUser): boolean {
  return hasAnyRole(user, ['mod', 'admin']) && user.status === 'active';
}

/**
 * Whether `actor` may mute or ban `target`. Nobody acts on themselves or on an admin; only an admin
 * acts on a moderator.
 */
export function canModerateUser(
  actor: PolicyUser & { id: string },
  target: { id: string; role: UserRole },
): boolean {
  if (!canModerate(actor) || actor.id === target.id) return false;
  switch (target.role) {
    case 'admin':
      return false;
    case 'mod':
      return actor.role === 'admin';
    default:
      return true;
  }
}
