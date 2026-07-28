import type { Message } from './types';

export type MessageEditHistoryItem = {
  text: string;
  editedAt?: string;
  editedBy?: string | null;
};

export function messageEditHistory(message: Pick<Message, 'payload'>): MessageEditHistoryItem[] {
  const history = message.payload?.editHistory;
  if (!Array.isArray(history)) return [];
  return history.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const version = item as Record<string, unknown>;
    if (typeof version.text !== 'string') return [];
    return [{
      text: version.text,
      editedAt: typeof version.editedAt === 'string' ? version.editedAt : undefined,
      editedBy: typeof version.editedBy === 'string' || version.editedBy === null ? version.editedBy : undefined,
    }];
  });
}

export function messageEditedAt(message: Pick<Message, 'payload'>) {
  return typeof message.payload?.editedAt === 'string' ? message.payload.editedAt : undefined;
}

export function isMessageEdited(message: Pick<Message, 'payload'>) {
  return message.payload?.edited === true || messageEditHistory(message).length > 0;
}
