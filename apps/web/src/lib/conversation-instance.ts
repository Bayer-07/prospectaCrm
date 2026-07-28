type ConversationInstanceState = {
  status: string;
  archivedAt?: string | null;
};

export function canChangeConversationInstance(instance: ConversationInstanceState) {
  return Boolean(instance.archivedAt) || instance.status === 'DISCONNECTED';
}
