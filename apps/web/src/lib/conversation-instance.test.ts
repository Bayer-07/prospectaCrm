import { describe, expect, it } from 'vitest';
import { canChangeConversationInstance } from './conversation-instance';

describe('troca de conexão da conversa', () => {
  it.each(['CONNECTED', 'CONNECTING', 'ERROR', 'PAUSED'])(
    'não oferece a troca quando a conexão está em %s',
    (status) => {
      expect(canChangeConversationInstance({ status, archivedAt: null })).toBe(false);
    },
  );

  it('oferece a troca quando a conexão está desconectada', () => {
    expect(canChangeConversationInstance({ status: 'DISCONNECTED', archivedAt: null })).toBe(true);
  });

  it('oferece a troca quando a conexão foi excluída', () => {
    expect(canChangeConversationInstance({
      status: 'CONNECTED',
      archivedAt: '2026-07-28T18:00:00.000Z',
    })).toBe(true);
  });
});
