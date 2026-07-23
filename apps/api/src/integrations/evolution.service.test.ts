import { describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../auth/types.js';
import { EvolutionService } from './evolution.service.js';

const auth: AuthContext = {
  type: 'session',
  organizationId: 'organization-1',
  userId: 'user-1',
  roleKey: 'admin',
  name: 'Gabriel',
  permissions: [],
};

describe('paginated conversation history', () => {
  it('returns the newest messages in chronological order and a cursor for older records', async () => {
    const newest = { id: 'message-3', createdAt: new Date('2026-07-20T13:03:00Z'), media: [] };
    const middle = { id: 'message-2', createdAt: new Date('2026-07-20T13:02:00Z'), media: [] };
    const oldest = { id: 'message-1', createdAt: new Date('2026-07-20T13:01:00Z'), media: [] };
    const findMany = vi.fn().mockResolvedValue([newest, middle, oldest]);
    const eventFindMany = vi.fn().mockResolvedValue([]);
    const db = {
      conversation: { findFirst: vi.fn().mockResolvedValue({ id: 'conversation-1' }) },
      message: { findMany },
      conversationEvent: { findMany: eventFindMany },
    };
    const service = new EvolutionService(db as never, {} as never, {} as never, {} as never);

    const page = await service.conversationMessages(auth, 'conversation-1', { limit: '2' });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 3 }));
    expect(page.messages.map((message) => message.id)).toEqual(['message-2', 'message-3']);
    expect(page.nextCursor).toBe('message-2');
    expect(eventFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ createdAt: { gte: middle.createdAt } }),
    }));
  });
});

describe('assinatura do operador', () => {
  it('adiciona o nome autenticado antes da mensagem quando a preferência está ativa', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'message-1' });
    const outboundQueue = { add: vi.fn().mockResolvedValue(undefined) };
    const db = {
      conversation: { findFirst: vi.fn().mockResolvedValue({ id: 'conversation-1', instanceId: 'instance-1', status: 'OPEN', assigneeId: 'user-1' }) },
      message: { create },
    };
    const realtime = { notifyOrganization: vi.fn() };
    const service = new EvolutionService(db as never, {} as never, outboundQueue as never, realtime as never);

    await service.sendMessage({ ...auth, name: 'Gabriel Bayer', messageSignatureEnabled: true }, 'conversation-1', { type: 'text', text: 'Olá' });

    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({
      text: '*Gabriel Bayer:*\nOlá',
      payload: expect.objectContaining({ signature: { userId: 'user-1', name: 'Gabriel Bayer' } }),
    }) });
  });

  it('aplica a assinatura na legenda de um anexo conforme a opção visível no composer', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'message-2' });
    const outboundQueue = { add: vi.fn().mockResolvedValue(undefined) };
    const db = {
      conversation: { findFirst: vi.fn().mockResolvedValue({ id: 'conversation-1', instanceId: 'instance-1', status: 'OPEN', assigneeId: 'user-1' }) },
      mediaAsset: {
        findUnique: vi.fn().mockResolvedValue({ id: 'media-1', key: 'organization-1/imagem.png' }),
        update: vi.fn().mockResolvedValue(undefined),
      },
      message: { create },
    };
    const realtime = { notifyOrganization: vi.fn() };
    const service = new EvolutionService(db as never, {} as never, outboundQueue as never, realtime as never);

    await service.sendMessage(
      { ...auth, name: 'Gabriel Bayer', messageSignatureEnabled: false },
      'conversation-1',
      { type: 'image', text: 'Oi', mediaKey: 'organization-1/imagem.png', signatureEnabled: true },
    );

    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({
      type: 'image',
      text: '*Gabriel Bayer:*\nOi',
      payload: expect.objectContaining({
        mediaKey: 'organization-1/imagem.png',
        signature: { userId: 'user-1', name: 'Gabriel Bayer' },
      }),
    }) });
  });

  it('não cria uma legenda apenas para incluir a assinatura quando o anexo não tem texto', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'message-3' });
    const outboundQueue = { add: vi.fn().mockResolvedValue(undefined) };
    const db = {
      conversation: { findFirst: vi.fn().mockResolvedValue({ id: 'conversation-1', instanceId: 'instance-1', status: 'OPEN', assigneeId: 'user-1' }) },
      mediaAsset: {
        findUnique: vi.fn().mockResolvedValue({ id: 'media-1', key: 'organization-1/imagem.png' }),
        update: vi.fn().mockResolvedValue(undefined),
      },
      message: { create },
    };
    const realtime = { notifyOrganization: vi.fn() };
    const service = new EvolutionService(db as never, {} as never, outboundQueue as never, realtime as never);

    await service.sendMessage(
      { ...auth, name: 'Gabriel Bayer', messageSignatureEnabled: true },
      'conversation-1',
      { type: 'image', mediaKey: 'organization-1/imagem.png', signatureEnabled: true },
    );

    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({
      type: 'image',
      text: undefined,
      payload: expect.objectContaining({ signature: null }),
    }) });
  });
});

describe('reações em mensagens do WhatsApp', () => {
  it('envia a chave original da mensagem recebida e persiste a reação', async () => {
    const update = vi.fn().mockResolvedValue({ id: 'message-1' });
    const db = {
      conversation: { findFirst: vi.fn().mockResolvedValue({ id: 'conversation-1', instanceId: 'instance-1', remoteJid: '5511999999999@s.whatsapp.net', status: 'OPEN', assigneeId: 'user-1', instance: { instanceKey: 'comercial' } }) },
      whatsappInstance: { findUnique: vi.fn().mockResolvedValue({ id: 'instance-1', instanceKey: 'comercial' }) },
      message: {
        findFirst: vi.fn().mockResolvedValue({ id: 'message-1', providerMessageId: 'provider-1', direction: 'INBOUND', payload: {} }),
        update,
      },
    };
    const realtime = { notifyOrganization: vi.fn() };
    const service = new EvolutionService(db as never, {} as never, {} as never, realtime as never);
    service.request = vi.fn().mockResolvedValue({});

    await service.reactToMessage(auth, 'conversation-1', 'message-1', '👍');

    expect(service.request).toHaveBeenCalledWith('/message/sendReaction/comercial', {
      method: 'POST',
      body: JSON.stringify({
        key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false, id: 'provider-1' },
        reaction: '👍',
      }),
    });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'message-1' },
      data: { payload: expect.objectContaining({ reactions: [expect.objectContaining({ emoji: '👍', userId: 'user-1', userName: 'Gabriel' })] }) },
    }));
  });
});

describe('edição e exclusão de mensagens enviadas', () => {
  function setup(messageOverrides: Record<string, unknown> = {}) {
    const update = vi.fn().mockResolvedValue({ id: 'message-1' });
    const db = {
      conversation: { findFirst: vi.fn().mockResolvedValue({ id: 'conversation-1', instanceId: 'instance-1', contactId: 'contact-1', remoteJid: '5511999999999@s.whatsapp.net', status: 'OPEN', assigneeId: 'user-1', instance: { instanceKey: 'comercial' } }) },
      whatsappInstance: { findUnique: vi.fn().mockResolvedValue({ id: 'instance-1', instanceKey: 'comercial' }) },
      contact: { findUnique: vi.fn().mockResolvedValue({ phone: '+5511999999999' }) },
      message: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'message-1',
          providerMessageId: 'provider-1',
          conversationId: 'conversation-1',
          direction: 'OUTBOUND',
          type: 'text',
          text: 'Texto original',
          status: 'SENT',
          payload: { provider: { key: { remoteJid: '5511999999999@s.whatsapp.net' } } },
          ...messageOverrides,
        }),
        update,
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const realtime = { notifyOrganization: vi.fn() };
    const service = new EvolutionService(db as never, {} as never, {} as never, realtime as never);
    service.request = vi.fn().mockResolvedValue({});
    return { db, service, update };
  }

  it('envia o contrato de edição esperado pela Evolution', async () => {
    const { service, update } = setup();

    await service.editMessage(auth, 'conversation-1', 'message-1', 'Texto corrigido');

    expect(service.request).toHaveBeenCalledWith('/chat/updateMessage/comercial', {
      method: 'POST',
      body: JSON.stringify({
        number: '5511999999999@s.whatsapp.net',
        text: 'Texto corrigido',
        key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: true, id: 'provider-1' },
      }),
    });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'message-1' }, data: expect.objectContaining({ text: 'Texto corrigido' }) }));
  });

  it('preserva o identificador LID usado pela mensagem ao editar', async () => {
    const remoteJid = '83953759293475@lid';
    const { service } = setup({ payload: { provider: { key: { remoteJid } } } });

    await service.editMessage(auth, 'conversation-1', 'message-1', 'Texto corrigido');

    expect(service.request).toHaveBeenCalledWith('/chat/updateMessage/comercial', {
      method: 'POST',
      body: JSON.stringify({
        number: remoteJid,
        text: 'Texto corrigido',
        key: { remoteJid, fromMe: true, id: 'provider-1' },
      }),
    });
  });

  it('envia o contrato de exclusão para todos esperado pela Evolution', async () => {
    const { service, update } = setup({ type: 'image', text: 'Legenda' });

    await service.deleteMessage(auth, 'conversation-1', 'message-1');

    expect(service.request).toHaveBeenCalledWith('/chat/deleteMessageForEveryone/comercial', {
      method: 'DELETE',
      body: JSON.stringify({ id: 'provider-1', remoteJid: '5511999999999@s.whatsapp.net', fromMe: true }),
    });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'message-1' },
      data: {
        payload: expect.objectContaining({
          deleted: true,
          originalType: 'image',
          originalText: 'Legenda',
        }),
      },
    }));
  });
});
