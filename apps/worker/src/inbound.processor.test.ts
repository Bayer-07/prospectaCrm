import { describe, expect, it } from 'vitest';
import { advanceEvolutionMessageStatus, deletedMessagePayload, evolutionCaptionRelation, evolutionMediaCaptionCandidate, evolutionMessageDate, evolutionMessageNeedsReconciliation, evolutionMessagesFingerprint, evolutionMessageText, evolutionMessageType, evolutionMessageUpdateId, evolutionMessageUpdateStatus, evolutionReaction, incomingConversationRoute, incomingConversationStatus, isSynchronizableEvolutionMessage, nextEvolutionSyncDelay, normalizeEvolutionEventType } from './inbound.processor.js';

describe('normalização dos eventos da Evolution', () => {
  it.each([
    ['messages.upsert', 'MESSAGES_UPSERT'],
    ['MESSAGES_UPSERT', 'MESSAGES_UPSERT'],
    ['messages-update', 'MESSAGES_UPDATE'],
    ['connection.update', 'CONNECTION_UPDATE'],
  ])('normaliza %s', (input, expected) => {
    expect(normalizeEvolutionEventType(input)).toBe(expected);
  });
});

describe('atualizações de entrega da Evolution', () => {
  it('usa keyId em vez do id interno da tabela da Evolution', () => {
    expect(evolutionMessageUpdateId({ keyId: 'wa-message-id', messageId: 'provider-row-id' })).toBe('wa-message-id');
  });

  it.each([
    ['ERROR', 'FAILED'],
    ['DELIVERY_ACK', 'DELIVERED'],
    ['READ', 'READ'],
    ['SERVER_ACK', 'SENT'],
  ])('converte %s para %s', (input, expected) => {
    expect(evolutionMessageUpdateStatus({ status: input })).toBe(expected);
  });

  it.each([
    ['SENT', 'DELIVERED', 'DELIVERED'],
    ['DELIVERED', 'READ', 'READ'],
    ['READ', 'SENT', 'READ'],
    ['DELIVERED', 'SENT', 'DELIVERED'],
  ])('keeps delivery progress from %s when receiving %s', (current, incoming, expected) => {
    expect(advanceEvolutionMessageStatus(current, incoming)).toBe(expected);
  });

  it('keeps confirmed delivery when a late failure arrives', () => {
    expect(advanceEvolutionMessageStatus('DELIVERED', 'FAILED')).toBe('DELIVERED');
  });
});

describe('fila de atendimento', () => {
  it('mantém sem responsável na fila aguardando', () => {
    expect(incomingConversationStatus(null)).toBe('WAITING');
  });

  it('mantém conversa atribuída aberta', () => {
    expect(incomingConversationStatus('user-id')).toBe('OPEN');
  });

  it('envia uma conversa encerrada de volta para a fila sem atendente', () => {
    expect(incomingConversationRoute('CLOSED', 'user-id')).toEqual({
      status: 'WAITING',
      assigneeId: null,
      reopened: true,
    });
  });

  it('não remove o atendente de uma conversa que já está aberta', () => {
    expect(incomingConversationRoute('OPEN', 'user-id')).toEqual({
      status: 'OPEN',
      assigneeId: 'user-id',
      reopened: false,
    });
  });
});

describe('reações da Evolution', () => {
  it('identifica a mensagem original sem criar uma nova bolha', () => {
    expect(evolutionReaction({
      message: { reactionMessage: { key: { id: 'original-message-id' }, text: '😂' } },
    })).toEqual({ targetProviderMessageId: 'original-message-id', emoji: '😂' });
  });

  it('ignora mensagens comuns', () => {
    expect(evolutionReaction({ message: { conversation: 'Olá' } })).toBeNull();
  });
});

describe('mensagens apagadas', () => {
  it('preserva texto, tipo e dados anteriores ao marcar uma mensagem como apagada', () => {
    expect(deletedMessagePayload({
      type: 'image',
      text: 'Legenda original',
      payload: { provider: { key: { id: 'wa-1' } } },
    }, '2026-07-21T12:00:00.000Z')).toEqual({
      provider: { key: { id: 'wa-1' } },
      deleted: true,
      deletedAt: '2026-07-21T12:00:00.000Z',
      originalType: 'image',
      originalText: 'Legenda original',
    });
  });
});

describe('tipos de mensagem da Evolution', () => {
  it('identifica figurinhas como mídia própria', () => {
    expect(evolutionMessageType({ stickerMessage: { mimetype: 'image/webp' } })).toBe('sticker');
  });

  it('extrai a legenda de documentos encapsulados', () => {
    const message = { documentWithCaptionMessage: { message: { documentMessage: { fileName: 'arquivo.pdf', caption: 'Texto do arquivo' } } } };
    expect(evolutionMessageType(message)).toBe('document');
    expect(evolutionMessageText(message)).toBe('Texto do arquivo');
  });

  it('encontra a cópia posterior do mesmo arquivo quando ela contém a legenda', () => {
    const original = {
      key: { id: 'original', fromMe: false },
      messageTimestamp: 100,
      message: { documentMessage: { fileName: 'Proposta.pdf', fileSha256: { 0: 1, 1: 2 } } },
    };
    const match = evolutionMediaCaptionCandidate(original, [{
      key: { id: 'with-caption', fromMe: false },
      messageTimestamp: 119,
      message: { documentMessage: { fileName: 'Proposta.pdf', fileSha256: { 0: 1, 1: 2 }, caption: 'Segue a proposta' } },
    }]);

    expect(match).toMatchObject({ text: 'Segue a proposta', candidate: { key: { id: 'with-caption' } } });
  });

  it('diferencia uma mensagem anterior com legenda de uma cópia posterior do provedor', () => {
    expect(evolutionCaptionRelation({ messageTimestamp: 120 }, { messageTimestamp: 115 })).toBe('companion');
    expect(evolutionCaptionRelation({ messageTimestamp: 120 }, { messageTimestamp: 135 })).toBe('replacement');
  });

  it('preserva a data original ao sincronizar uma mensagem que não teve webhook', () => {
    expect(evolutionMessageDate({ messageTimestamp: 1784639348 }).toISOString()).toBe('2026-07-21T13:09:08.000Z');
  });

  it('sincroniza um documento recente com texto mesmo sem webhook', () => {
    expect(isSynchronizableEvolutionMessage({
      key: { id: '3EB0C4B322F23822E3BEDD', remoteJid: '554599225389@s.whatsapp.net', fromMe: true },
      messageTimestamp: 1784639348,
      message: { documentMessage: { fileName: 'arquivo.pdf', caption: 'oi' } },
    }, new Date('2026-07-21T13:08:00.000Z'))).toBe(true);
  });

  it('não importa mensagens anteriores à janela incremental', () => {
    expect(isSynchronizableEvolutionMessage({
      key: { id: 'antiga', remoteJid: '554599225389@s.whatsapp.net' },
      messageTimestamp: 1784639348,
      message: { documentMessage: { fileName: 'arquivo.pdf', caption: 'oi' } },
    }, new Date('2026-07-21T13:10:00.000Z'))).toBe(false);
  });
});

describe('sincronização incremental da Evolution', () => {
  it('reduz a frequência gradualmente quando a instância permanece ociosa', () => {
    expect(nextEvolutionSyncDelay(5_000, false)).toBe(7_500);
    expect(nextEvolutionSyncDelay(10_000, false)).toBe(15_000);
    expect(nextEvolutionSyncDelay(60_000, false)).toBe(15_000);
  });

  it('volta ao intervalo rápido quando encontra atividade', () => {
    expect(nextEvolutionSyncDelay(60_000, true)).toBe(5_000);
  });

  it('detecta alteração de legenda sem reconsultar o banco quando nada mudou', () => {
    const base = [{
      key: { id: 'message-1' },
      messageTimestamp: 123,
      message: { documentMessage: { fileName: 'arquivo.pdf' } },
    }];
    const captioned = [{
      ...base[0],
      message: { documentMessage: { fileName: 'arquivo.pdf', caption: 'Legenda' } },
    }];

    expect(evolutionMessagesFingerprint(base)).toBe(evolutionMessagesFingerprint(base));
    expect(evolutionMessagesFingerprint(captioned)).not.toBe(evolutionMessagesFingerprint(base));
  });

  it('reconcilia uma legenda que chegou depois do arquivo', () => {
    expect(evolutionMessageNeedsReconciliation(
      { type: 'document', text: null, media: [{ id: 'media-1' }] },
      { message: { documentMessage: { fileName: 'arquivo.pdf', caption: 'Legenda tardia' } } },
    )).toBe(true);
  });

  it('tenta recuperar uma midia conhecida que ainda nao foi armazenada', () => {
    expect(evolutionMessageNeedsReconciliation(
      { type: 'image', text: null, media: [] },
      { message: { imageMessage: { mimetype: 'image/jpeg' } } },
    )).toBe(true);
  });

  it('ignora uma mensagem conhecida que ja esta completa', () => {
    expect(evolutionMessageNeedsReconciliation(
      { type: 'document', text: 'Legenda', media: [{ id: 'media-1' }] },
      { message: { documentMessage: { fileName: 'arquivo.pdf', caption: 'Legenda' } } },
    )).toBe(false);
  });
});
