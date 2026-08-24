import type { AuthContext } from './types.js';

export function authTeamIds(auth: AuthContext) {
  if (auth.teamIds !== undefined) return [...new Set(auth.teamIds)];
  return auth.teamId ? [auth.teamId] : [];
}

export function permissionScope(auth: AuthContext, resource: string, action = 'read') {
  const permission = auth.permissions.find((item) =>
    (item.resource === '*' || item.resource === resource) && (item.action === '*' || item.action === action));
  return permission?.scope || 'OWN';
}

export function scopedWhere(auth: AuthContext, resource: string, action = 'read') {
  const scope = permissionScope(auth, resource, action);
  if (scope === 'ALL') return {};
  if (scope === 'TEAM') {
    const teamIds = authTeamIds(auth);
    return teamIds.length ? { teamId: { in: teamIds } } : { id: '__none__' };
  }
  return auth.userId ? { ownerId: auth.userId } : { id: '__none__' };
}
