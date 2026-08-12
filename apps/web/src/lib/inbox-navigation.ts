export type InboxFilter = 'waiting' | 'open' | 'closed';

export function inboxFilterForStatus(status: string): InboxFilter {
  if (status === 'CLOSED') return 'closed';
  if (status === 'WAITING') return 'waiting';
  return 'open';
}

export function shouldSyncInboxFilter(
  conversationId: string | undefined,
  status: string | undefined,
  closingWithoutFilterChangeId: string | null,
) {
  if (!conversationId || !status) return false;
  return !(closingWithoutFilterChangeId === conversationId && status === 'CLOSED');
}
