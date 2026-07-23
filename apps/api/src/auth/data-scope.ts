import type { AuthContext } from './types.js';

export function permissionScope(auth: AuthContext, resource: string, action = 'read') {
  const permission = auth.permissions.find((item) =>
    (item.resource === '*' || item.resource === resource) && (item.action === '*' || item.action === action));
  return permission?.scope || 'OWN';
}

export function scopedWhere(auth: AuthContext, resource: string, action = 'read') {
  const scope = permissionScope(auth, resource, action);
  if (scope === 'ALL') return {};
  if (scope === 'TEAM') return auth.teamId ? { teamId: auth.teamId } : { id: '__none__' };
  return auth.userId ? { ownerId: auth.userId } : { id: '__none__' };
}
