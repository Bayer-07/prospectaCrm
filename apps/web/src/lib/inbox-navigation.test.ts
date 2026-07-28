import { describe, expect, it } from 'vitest';
import { inboxFilterForStatus, shouldSyncInboxFilter } from './inbox-navigation';

describe('navegação do Inbox ao alterar o atendimento', () => {
  it('mantém a aba atual ao finalizar a conversa selecionada', () => {
    expect(shouldSyncInboxFilter('conversation-1', 'CLOSED', 'conversation-1')).toBe(false);
  });

  it('continua sincronizando a aba ao abrir uma conversa diretamente', () => {
    expect(shouldSyncInboxFilter('conversation-1', 'CLOSED', null)).toBe(true);
    expect(inboxFilterForStatus('CLOSED')).toBe('closed');
    expect(inboxFilterForStatus('WAITING')).toBe('waiting');
    expect(inboxFilterForStatus('OPEN')).toBe('open');
  });
});
