import type { Prisma } from '@prisma/client';
import type { AuthContext } from '../auth/types.js';

export function conversationVisibilityWhere(auth: AuthContext, requestAll = false): Prisma.ConversationWhereInput {
  if (auth.roleKey === 'admin' && requestAll) return {};
  if (!auth.userId) return { id: '__none__' };

  const visible: Prisma.ConversationWhereInput[] = [{ assigneeId: auth.userId }];
  if (auth.roleKey === 'admin') visible.push({ assigneeId: null });
  else if (auth.teamId) visible.push({ assigneeId: null, instance: { teams: { some: { teamId: auth.teamId } } } });
  return { OR: visible };
}
