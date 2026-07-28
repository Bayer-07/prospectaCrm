export type InboxFilter = 'waiting' | 'open' | 'closed';

export function inboxFilterForStatus(status: string): InboxFilter {
  return status === 'CLOSED' ? 'closed' : status === 'WAITING' ? 'waiting' : 'open';
}

export function shouldSyncInboxFilter(
  conversationId: string | undefined,
  status: string | undefined,
  closingWithoutFilterChangeId: string | null,
) {
  if (!conversationId || !status) return false;
  return !(closingWithoutFilterChangeId === conversationId && status === 'CLOSED');
}
