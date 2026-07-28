import { describe, expect, it } from 'vitest';
import { createCipheriv, hkdfSync } from 'node:crypto';
import { advanceEvolutionMessageStatus, decodeWhatsappSecretEdit, decryptEvolutionSecretEdit, deletedMessagePayload, editedMessagePayload, evolutionCaptionRelation, evolutionEditedMessage, evolutionMediaCaptionCandidate, evolutionMessageDate, evolutionMessageNeedsReconciliation, evolutionMessagesFingerprint, evolutionMessageText, evolutionMessageType, evolutionMessageUpdateId, evolutionMessageUpdateStatus, evolutionReaction, evolutionReplyProviderMessageId, evolutionSecretEditEnvelope, incomingConversationRoute, incomingConversationStatus, isSynchronizableEvolutionMessage, nextEvolutionSyncDelay, normalizeEvolutionEventType } from './inbound.processor.js';

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

describe('respostas recebidas pela Evolution', () => {
  it('extrai o ID da mensagem citada no contextInfo do evento', () => {
    expect(evolutionReplyProviderMessageId({
      contextInfo: {
        stanzaId: '3EB0C1E456BF121371A58E',
        quotedMessage: { conversation: 'Mensagem original' },
      },
      message: { conversation: 'Resposta do cliente' },
    })).toBe('3EB0C1E456BF121371A58E');
  });

  it('extrai o ID quando o contexto vem dentro de extendedTextMessage', () => {
    expect(evolutionReplyProviderMessageId({
      message: {
        extendedTextMessage: {
          text: 'Resposta',
          contextInfo: { stanzaId: 'provider-original' },
        },
      },
    })).toBe('provider-original');
  });

  it('ignora mensagens que não respondem outra mensagem', () => {
    expect(evolutionReplyProviderMessageId({ message: { conversation: 'Mensagem comum' } })).toBeNull();
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

describe('mensagens editadas no WhatsApp', () => {
  const lengthDelimited = (field: number, value: Buffer) => Buffer.concat([
    Buffer.from([(field << 3) | 2, value.length]),
    value,
  ]);

  it('decodifica e descriptografa o envelope MESSAGE_EDIT recente', () => {
    const targetProviderMessageId = 'ORIGINAL-1';
    const jid = '83953759293475@lid';
    const editedText = 'Texto editado no celular';
    const messageKey = Buffer.concat([
      lengthDelimited(1, Buffer.from('58738710982911@lid')),
      Buffer.from([0x10, 0x01]),
      lengthDelimited(3, Buffer.from(targetProviderMessageId)),
    ]);
    const extendedText = lengthDelimited(1, Buffer.from(editedText));
    const editedMessage = lengthDelimited(6, extendedText);
    const protocol = Buffer.concat([
      lengthDelimited(1, messageKey),
      Buffer.from([0x10, 0x0e]),
      lengthDelimited(14, editedMessage),
    ]);
    const plaintext = lengthDelimited(12, protocol);
    const messageSecret = Buffer.from(Array.from({ length: 32 }, (_, index) => index + 1));
    const iv = Buffer.from(Array.from({ length: 12 }, (_, index) => 20 + index));
    const key = Buffer.from(hkdfSync(
      'sha256',
      messageSecret,
      Buffer.alloc(0),
      Buffer.from(`${targetProviderMessageId}${jid}${jid}Message Edit`),
      32,
    ));
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encryptedPayload = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
    const edit = {
      key: { id: 'EDIT-1', remoteJid: jid, fromMe: false },
      message: {
        secretEncryptedMessage: {
          targetMessageKey: { id: targetProviderMessageId, remoteJid: '58738710982911@lid', fromMe: true },
          secretEncType: 2,
          encIv: Object.fromEntries(iv.entries()),
          encPayload: Object.fromEntries(encryptedPayload.entries()),
        },
      },
    };
    const original = {
      key: { id: targetProviderMessageId, remoteJid: '554599225389@s.whatsapp.net', fromMe: false },
      message: {
        conversation: 'Texto original',
        messageContextInfo: { messageSecret: Object.fromEntries(messageSecret.entries()) },
      },
    };

    expect(evolutionSecretEditEnvelope(edit)).toMatchObject({
      providerMessageId: 'EDIT-1',
      targetProviderMessageId,
    });
    expect(decodeWhatsappSecretEdit(plaintext)).toEqual({ targetProviderMessageId, text: editedText });
    expect(decryptEvolutionSecretEdit(edit, original)).toEqual({
      providerMessageId: 'EDIT-1',
      targetProviderMessageId,
      text: editedText,
    });
  });

  it('entende o evento MESSAGES_EDITED tradicional da Evolution', () => {
    expect(evolutionEditedMessage({
      data: {
        key: { id: 'ORIGINAL-2' },
        type: 14,
        editedMessage: { extendedTextMessage: { text: 'Nova versão' } },
      },
    })).toEqual({ targetProviderMessageId: 'ORIGINAL-2', text: 'Nova versão' });
  });

  it('preserva a versão anterior e não duplica o mesmo evento', () => {
    const first = editedMessagePayload(
      { text: 'Antes', payload: { provider: { key: { id: 'ORIGINAL-3' } } } },
      'Depois',
      '2026-07-27T17:47:30.000Z',
      'EDIT-3',
    );
    expect(first).toMatchObject({
      edited: true,
      editedSource: 'WHATSAPP',
      editEventIds: ['EDIT-3'],
      editHistory: [{ text: 'Antes', editedAt: '2026-07-27T17:47:30.000Z', editedBy: null }],
    });
    expect(editedMessagePayload(
      { text: 'Depois', payload: first },
      'Depois',
      '2026-07-27T17:47:30.000Z',
      'EDIT-3',
    )).toBeNull();
  });
});

describe('tipos de mensagem da Evolution', () => {
  it('identifica e sincroniza uma localização mesmo sem texto', () => {
    const message = {
      locationMessage: {
        degreesLatitude: -24.5588903,
        degreesLongitude: -54.0577961,
        jpegThumbnail: { 0: 255, 1: 216, 2: 255 },
      },
    };
    expect(evolutionMessageType(message)).toBe('location');
    expect(isSynchronizableEvolutionMessage({
      key: { id: 'location-1', remoteJid: '554588433153@s.whatsapp.net', fromMe: false },
      messageTimestamp: 1785262532,
      message,
    }, new Date('2026-07-28T00:00:00.000Z'))).toBe(true);
  });

  it('usa nome ou endereço de uma localização como prévia quando disponível', () => {
    expect(evolutionMessageText({
      locationMessage: {
        degreesLatitude: -24.55,
        degreesLongitude: -54.05,
        name: 'Escritório BZS',
      },
    })).toBe('Escritório BZS');
  });

  it('identifica um contato compartilhado e usa o nome como prévia', () => {
    const message = {
      contactMessage: {
        displayName: 'José Inácio',
        vcard: 'BEGIN:VCARD\nFN:José Inácio\nTEL;waid=553791911020:+55 37 99191-1020\nEND:VCARD',
      },
    };
    expect(evolutionMessageType(message)).toBe('contact');
    expect(evolutionMessageText(message)).toBe('José Inácio');
  });

  it('sincroniza contatos compartilhados recentes mesmo sem texto comum', () => {
    expect(isSynchronizableEvolutionMessage({
      key: { id: 'contact-1', remoteJid: '553791183525@s.whatsapp.net', fromMe: false },
      messageTimestamp: 1785159591,
      message: {
        contactMessage: {
          displayName: 'José Inácio',
          vcard: 'BEGIN:VCARD\nFN:José Inácio\nTEL;waid=553791911020:+55 37 99191-1020\nEND:VCARD',
        },
      },
    }, new Date('2026-07-27T13:38:00.000Z'))).toBe(true);
  });

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
