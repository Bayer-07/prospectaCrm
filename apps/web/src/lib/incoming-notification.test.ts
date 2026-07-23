import { describe, expect, it } from 'vitest';
import { openInboxConversationId, shouldPlayIncomingMessageSound, type InboxRealtimePayload } from './incoming-notification';

const incoming = (conversationId = 'conversation-2', assigneeId: string | null = null): InboxRealtimePayload => ({
  conversationId,
  newMessage: { id: 'message-1', direction: 'INBOUND', assigneeId },
});

describe('som de nova mensagem', () => {
  it('não toca quando a conversa do remetente está aberta', () => {
    expect(shouldPlayIncomingMessageSound(incoming(), '/inbox/conversation-2', { userId: 'user-1' })).toBe(false);
  });

  it('toca para a conversa aberta quando a página não está em foco', () => {
    expect(shouldPlayIncomingMessageSound(incoming(), '/inbox/conversation-2', { userId: 'user-1' }, false)).toBe(true);
  });

  it('toca quando outra conversa está aberta', () => {
    expect(shouldPlayIncomingMessageSound(incoming(), '/inbox/conversation-1', { userId: 'user-1' })).toBe(true);
  });

  it('ignora mensagens enviadas pelo próprio sistema', () => {
    expect(shouldPlayIncomingMessageSound({
      conversationId: 'conversation-2',
      newMessage: { id: 'message-1', direction: 'OUTBOUND', assigneeId: 'user-1' },
    }, '/inbox/conversation-1', { userId: 'user-1' })).toBe(false);
  });

  it('não avisa um usuário sobre conversa atribuída a outra pessoa', () => {
    expect(shouldPlayIncomingMessageSound(incoming('conversation-2', 'user-2'), '/', { userId: 'user-1', roleKey: 'sdr' })).toBe(false);
  });

  it('permite que administradores sejam avisados sobre qualquer atendimento', () => {
    expect(shouldPlayIncomingMessageSound(incoming('conversation-2', 'user-2'), '/', { userId: 'admin-1', roleKey: 'admin' })).toBe(true);
  });

  it('extrai a conversa aberta de uma rota da inbox', () => {
    expect(openInboxConversationId('/inbox/conversation%202')).toBe('conversation 2');
  });
});
