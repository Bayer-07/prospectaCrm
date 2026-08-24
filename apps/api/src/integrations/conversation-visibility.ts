import { Prisma } from '@prisma/client';
import type { AuthContext } from '../auth/types.js';
import { authTeamIds } from '../auth/data-scope.js';

export function conversationVisibilityWhere(auth: AuthContext, requestAll = false): Prisma.ConversationWhereInput {
  if (auth.roleKey === 'admin' && requestAll) return {};
  if (!auth.userId) return { id: '__none__' };
  if (auth.roleKey === 'admin') return { OR: [{ assigneeId: auth.userId }, { assigneeId: null }] };
  const teamIds = authTeamIds(auth);
  return {
    OR: [
      ...(teamIds.length ? [{ teamId: { in: teamIds } }] : []),
      { teamId: null, assigneeId: auth.userId },
    ],
  };
}

export function conversationVisibilitySql(auth: AuthContext) {
  if (auth.roleKey === 'admin') return Prisma.sql`TRUE`;
  if (!auth.userId) return Prisma.sql`FALSE`;
  const teamIds = authTeamIds(auth);
  const teamAccess = teamIds.length
    ? Prisma.sql`"teamId" IN (${Prisma.join(teamIds.map((teamId) => Prisma.sql`${teamId}::uuid`))})`
    : Prisma.sql`FALSE`;
  return Prisma.sql`(${teamAccess} OR ("teamId" IS NULL AND "assigneeId" = ${auth.userId}::uuid))`;
}
