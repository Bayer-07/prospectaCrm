import { describe, expect, it, vi } from 'vitest';
import { CampaignProcessor, campaignContactVariables, campaignMessageSequence } from './campaign.processor.js';

vi.mock('./storage.js', () => ({
  signedMediaUrl: vi.fn().mockResolvedValue('http://minio.local/proposta-assinada'),
  storedMediaBase64: vi.fn().mockResolvedValue('audio-base64'),
}));

describe('mensagens personalizadas de campanhas', () => {
  const campaignMessages = [{ id: 'bubble-1', type: 'text', content: 'Mensagem geral', mediaKey: null }];

  it('usa as mensagens que vieram na linha do CSV', () => {
    const result = campaignMessageSequence([
      { type: 'text', content: 'Mensagem pronta 1' },
      { type: 'text', content: 'Mensagem pronta 2' },
    ], campaignMessages);

    expect(result.map((message) => message.content)).toEqual(['Mensagem pronta 1', 'Mensagem pronta 2']);
  });

  it('usa as mensagens gerais para contatos selecionados da agenda', () => {
    expect(campaignMessageSequence([], campaignMessages)).toEqual(campaignMessages);
  });

  it('prepara as variáveis em português usadas no conteúdo enviado', () => {
    expect(campaignContactVariables({
      name: 'Maria',
      phone: '+5545999999999',
      email: 'maria@example.com',
      jobTitle: 'Síndica',
      companies: [{ company: { name: 'Condomínio Acme' } }],
    })).toMatchObject({
      nome: 'Maria',
      telefone: '+5545999999999',
      email: 'maria@example.com',
      cargo: 'Síndica',
      empresa: 'Condomínio Acme',
    });
  });
});

describe('documentos em campanhas de WhatsApp', () => {
  function campaignDocumentFixture(asset: { key: string; filename: string; contentType: string } | null) {
    const mediaKey = 'organization-1/2026-08-24/proposta.pdf';
    const db = {
      campaignRecipient: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'recipient-document',
          status: 'QUEUED',
          messages: [],
          whatsappVerifiedAt: new Date(),
          contact: {
            id: 'contact-1',
            name: 'Maria',
            phone: '+5545999999999',
            campaignsBlocked: false,
            suppressions: [],
            companies: [],
          },
          campaign: {
            id: 'campaign-document',
            organizationId: 'organization-1',
            instanceId: 'instance-1',
            status: 'RUNNING',
            bubbles: [{ id: 'bubble-document', type: 'document', content: 'Segue a proposta', mediaKey }],
            instance: { instanceKey: 'comercial', status: 'CONNECTED' },
            bubbleDelayMinSeconds: 3,
            bubbleDelayMaxSeconds: 7,
          },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      mediaAsset: { findUnique: vi.fn().mockResolvedValue(asset) },
      conversation: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'conversation-1',
          remoteJid: '5545999999999@s.whatsapp.net',
          teamId: 'team-1',
        }),
      },
      message: { create: vi.fn().mockResolvedValue({}) },
    };
    const queue = { add: vi.fn().mockResolvedValue({}) };
    const evolution = { send: vi.fn().mockResolvedValue({ key: { id: 'provider-document' } }) };
    return { db, queue, evolution, mediaKey };
  }

  it('propaga nome e MIME do MediaAsset para a Evolution', async () => {
    const fixture = campaignDocumentFixture({
      key: 'organization-1/2026-08-24/proposta.pdf',
      filename: 'Proposta comercial.pdf',
      contentType: 'application/pdf',
    });
    const processor = new CampaignProcessor(fixture.db as never, fixture.queue as never, fixture.evolution as never);

    await processor.process({
      name: 'send-campaign-bubble',
      data: { recipientId: 'recipient-document', position: 0 },
      opts: { attempts: 3 },
      attemptsMade: 0,
    } as never);

    expect(fixture.evolution.send).toHaveBeenCalledWith('comercial', expect.objectContaining({
      type: 'document',
      mediaUrl: 'http://minio.local/proposta-assinada',
      fileName: 'Proposta comercial.pdf',
      mimeType: 'application/pdf',
    }));
  });

  it('falha antes da Evolution quando o anexo foi removido', async () => {
    const fixture = campaignDocumentFixture(null);
    const processor = new CampaignProcessor(fixture.db as never, fixture.queue as never, fixture.evolution as never);

    await expect(processor.process({
      name: 'send-campaign-bubble',
      data: { recipientId: 'recipient-document', position: 0 },
      opts: { attempts: 3 },
      attemptsMade: 0,
    } as never)).rejects.toThrow('O anexo da campanha não está mais disponível');
    expect(fixture.evolution.send).not.toHaveBeenCalled();
  });
});

describe('campanhas de e-mail', () => {
  it('renderiza o modelo e envia pelo Gmail configurado para campanhas', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const campaignUpdate = vi.fn().mockResolvedValue({ sentRecipientCount: 1 });
    const tx = { campaignRecipient: { updateMany }, campaign: { update: campaignUpdate } };
    const db = {
      campaignRecipient: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'recipient-1',
          status: 'QUEUED',
          messages: [],
          contact: {
            id: 'contact-1',
            name: 'Maria',
            email: 'maria@example.com',
            phone: null,
            suppressions: [],
            companies: [{ company: { name: 'Acme' } }],
          },
          campaign: {
            id: 'campaign-1',
            channel: 'EMAIL',
            status: 'RUNNING',
            emailSubject: 'Olá {{nome}}',
            bubbles: [{
              type: 'html',
              content: '<style>.hidden{display:none}</style><div data-email-preheader="true">Prévia invisível</div><p>Empresa: {{empresa}}</p>',
            }],
            contactDelayMinSeconds: 5,
            contactDelayMaxSeconds: 10,
            batchSize: 50,
            batchPauseMinSeconds: 60,
            batchPauseMaxSeconds: 120,
          },
        }),
        count: vi.fn().mockResolvedValue(1),
      },
      campaign: { findUnique: vi.fn().mockResolvedValue({ status: 'RUNNING' }) },
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const add = vi.fn().mockResolvedValue({});
    const send = vi.fn().mockResolvedValue({ id: 'gmail-message-id' });
    const processor = new CampaignProcessor(db as never, { add } as never, {} as never, { send } as never);

    await processor.process({ name: 'send-campaign-email', data: { recipientId: 'recipient-1' } } as never);

    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      to: 'maria@example.com',
      subject: 'Olá Maria',
      html: expect.stringContaining('Empresa: Acme'),
      text: expect.stringContaining('Cancelar inscrição: %unsubscribe_url%'),
    }));
    expect(send.mock.calls[0]?.[0]?.text).not.toContain('.hidden');
    expect(send.mock.calls[0]?.[0]?.text).not.toContain('Prévia invisível');
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'SENT', providerMessageId: 'gmail-message-id' }),
    }));
    expect(add).toHaveBeenCalledWith('dispatch-campaign', { campaignId: 'campaign-1' }, expect.any(Object));
  });

  it.each([
    { channel: 'EMAIL', jobName: 'send-campaign-email' },
    { channel: 'WHATSAPP', jobName: 'send-campaign-bubble' },
  ])('ignora contato bloqueado durante o processamento de campanha $channel', async ({ channel, jobName }) => {
    const recipientUpdate = vi.fn().mockResolvedValue({});
    const campaignUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const db = {
      campaignRecipient: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'recipient-1',
          status: 'QUEUED',
          messages: [],
          whatsappVerifiedAt: new Date(),
          contact: {
            id: 'contact-1',
            name: 'Contato bloqueado',
            email: 'bloqueado@example.com',
            phone: '+5545999999999',
            campaignsBlocked: true,
            suppressions: [],
            companies: [],
          },
          campaign: {
            id: 'campaign-1',
            channel,
            organizationId: 'organization-1',
            instanceId: 'instance-1',
            status: 'RUNNING',
            emailSubject: 'Assunto',
            contactDelayMinSeconds: 5,
            contactDelayMaxSeconds: 10,
            bubbles: [{ id: 'bubble-1', type: 'text', content: 'Olá' }],
            instance: { instanceKey: 'instance-key', status: 'CONNECTED' },
          },
        }),
        update: recipientUpdate,
        count: vi.fn().mockResolvedValue(0),
      },
      campaign: {
        findUnique: vi.fn().mockResolvedValue({ status: 'RUNNING' }),
        updateMany: campaignUpdateMany,
      },
    };
    const queue = { add: vi.fn() };
    const evolution = { send: vi.fn() };
    const mailgun = { send: vi.fn() };
    const processor = new CampaignProcessor(db as never, queue as never, evolution as never, mailgun as never);

    await processor.process({
      name: jobName,
      data: { recipientId: 'recipient-1', position: 0 },
      opts: { attempts: 3 },
      attemptsMade: 0,
    } as never);

    expect(recipientUpdate).toHaveBeenCalledWith({
      where: { id: 'recipient-1' },
      data: {
        status: 'SKIPPED',
        exclusionReason: 'Campanhas bloqueadas para este contato',
      },
    });
    expect(evolution.send).not.toHaveBeenCalled();
    expect(mailgun.send).not.toHaveBeenCalled();
    expect(campaignUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'COMPLETED' }),
    }));
  });

  it('conclui imediatamente a campanha quando o último destinatário é ignorado', async () => {
    const recipientUpdate = vi.fn().mockResolvedValue({});
    const campaignUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const db = {
      campaignRecipient: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'recipient-1',
          status: 'QUEUED',
          messages: [],
          whatsappVerifiedAt: null,
          contact: {
            id: 'contact-1',
            name: 'Sem WhatsApp',
            email: null,
            phone: '+5545999999999',
            suppressions: [],
            companies: [],
          },
          campaign: {
            id: 'campaign-1',
            organizationId: 'organization-1',
            instanceId: 'instance-1',
            status: 'RUNNING',
            contactDelayMinSeconds: 5,
            contactDelayMaxSeconds: 10,
            bubbles: [{ id: 'bubble-1', type: 'text', content: 'Olá' }],
            instance: { instanceKey: 'instance-key', status: 'CONNECTED' },
          },
        }),
        update: recipientUpdate,
        count: vi.fn().mockResolvedValue(0),
      },
      campaign: {
        findUnique: vi.fn().mockResolvedValue({ status: 'RUNNING' }),
        updateMany: campaignUpdateMany,
      },
    };
    const add = vi.fn();
    const checkWhatsappNumbers = vi.fn().mockResolvedValue([{ number: '5545999999999', exists: false }]);
    const processor = new CampaignProcessor(db as never, { add } as never, { checkWhatsappNumbers } as never);

    await processor.process({
      name: 'send-campaign-bubble',
      data: { recipientId: 'recipient-1', position: 0 },
    } as never);

    expect(recipientUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'SKIPPED' }),
    }));
    expect(campaignUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'COMPLETED' }),
    }));
    expect(add).not.toHaveBeenCalled();
  });

  it('mantém o destinatário enfileirado enquanto ainda há tentativas de envio', async () => {
    const recipientUpdate = vi.fn();
    const db = {
      campaignRecipient: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'recipient-1',
          status: 'QUEUED',
          messages: [],
          whatsappVerifiedAt: new Date(),
          contact: {
            id: 'contact-1',
            name: 'Maria',
            phone: '+5545999999999',
            suppressions: [],
            companies: [],
          },
          campaign: {
            id: 'campaign-1',
            organizationId: 'organization-1',
            instanceId: 'instance-1',
            status: 'RUNNING',
            bubbles: [{ id: 'bubble-1', type: 'text', content: 'Olá' }],
            instance: { instanceKey: 'instance-key', status: 'CONNECTED' },
          },
        }),
        update: recipientUpdate,
      },
      conversation: {
        findFirst: vi.fn().mockResolvedValue({ id: 'conversation-1', remoteJid: '5545999999999@s.whatsapp.net' }),
      },
      warmupProfile: { update: vi.fn() },
      $transaction: vi.fn(),
    };
    const send = vi.fn().mockRejectedValue(new Error('ETIMEDOUT'));
    const processor = new CampaignProcessor(db as never, {} as never, { send } as never);

    await expect(processor.process({
      name: 'send-campaign-bubble',
      data: { recipientId: 'recipient-1', position: 0 },
      opts: { attempts: 3 },
      attemptsMade: 0,
    } as never)).rejects.toThrow('ETIMEDOUT');

    expect(recipientUpdate).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('pausa somente a campanha afetada quando a conexão do número é fechada', async () => {
    const recipientUpdateMany = vi.fn();
    const campaignUpdateMany = vi.fn();
    const instanceUpdateMany = vi.fn();
    const transaction = vi.fn().mockResolvedValue([]);
    const db = {
      campaignRecipient: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'recipient-1',
          status: 'QUEUED',
          messages: [],
          whatsappVerifiedAt: new Date(),
          contact: {
            id: 'contact-1',
            name: 'Maria',
            phone: '+5545999999999',
            suppressions: [],
            companies: [],
          },
          campaign: {
            id: 'campaign-1',
            organizationId: 'organization-1',
            instanceId: 'instance-1',
            status: 'RUNNING',
            bubbles: [{ id: 'bubble-1', type: 'text', content: 'Olá' }],
            instance: { instanceKey: 'instance-key', status: 'CONNECTED' },
          },
        }),
        updateMany: recipientUpdateMany,
      },
      campaign: { updateMany: campaignUpdateMany },
      whatsappInstance: { updateMany: instanceUpdateMany },
      conversation: {
        findFirst: vi.fn().mockResolvedValue({ id: 'conversation-1', remoteJid: '5545999999999@s.whatsapp.net' }),
      },
      $transaction: transaction,
    };
    const send = vi.fn().mockRejectedValue(new Error('Evolution: Connection Closed'));
    const processor = new CampaignProcessor(db as never, {} as never, { send } as never);

    await expect(processor.process({
      name: 'send-campaign-bubble',
      data: { recipientId: 'recipient-1', position: 0 },
      opts: { attempts: 3 },
      attemptsMade: 0,
    } as never)).resolves.toBeUndefined();

    expect(recipientUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PENDING' }),
    }));
    expect(campaignUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'campaign-1', status: 'RUNNING' },
      data: { status: 'PAUSED' },
    }));
    expect(instanceUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'DISCONNECTED' }),
    }));
    expect(transaction).toHaveBeenCalledOnce();
  });

  it('reconcilia concluídas e reativa duas campanhas órfãs em paralelo', async () => {
    const campaignUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const db = {
      campaign: {
        updateMany: campaignUpdateMany,
        findMany: vi.fn().mockResolvedValue([
          { id: 'scheduled' },
          { id: 'orphan-1' },
          { id: 'orphan-2' },
        ]),
      },
    };
    const add = vi.fn().mockResolvedValue({});
    const getJobs = vi.fn().mockResolvedValue([{
      name: 'dispatch-campaign',
      data: { campaignId: 'scheduled' },
    }]);
    const processor = new CampaignProcessor(db as never, { add, getJobs } as never, {} as never);

    await expect(processor.reconcileActiveCampaigns()).resolves.toEqual({ completed: 1, requeued: 2 });

    expect(campaignUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'RUNNING' }),
      data: expect.objectContaining({ status: 'COMPLETED' }),
    }));
    expect(add).toHaveBeenCalledTimes(2);
    expect(add).toHaveBeenCalledWith(
      'dispatch-campaign',
      { campaignId: 'orphan-1' },
      expect.objectContaining({ jobId: expect.stringContaining('campaign-orphan-1-recovery-') }),
    );
    expect(add).toHaveBeenCalledWith(
      'dispatch-campaign',
      { campaignId: 'orphan-2' },
      expect.objectContaining({ jobId: expect.stringContaining('campaign-orphan-2-recovery-') }),
    );
  });

  it('registra entrega recebida pelo webhook sem duplicar o evento', async () => {
    const eventCreate = vi.fn().mockResolvedValue({});
    const recipientUpdate = vi.fn().mockResolvedValue({});
    const tx = {
      emailDeliveryEvent: { create: eventCreate },
      campaignRecipient: { update: recipientUpdate },
      suppression: { upsert: vi.fn() },
    };
    const db = {
      campaignRecipient: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'recipient-1',
          contactId: 'contact-1',
          status: 'SENT',
        }),
      },
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const processor = new CampaignProcessor(db as never, {} as never, {} as never, {} as never);

    await processor.process({
      name: 'mailgun-event',
      data: {
        eventData: {
          id: 'event-1',
          event: 'delivered',
          timestamp: 1_770_000_000,
          recipient: 'maria@example.com',
          'user-variables': { 'recipient-id': 'recipient-1' },
        },
      },
    } as never);

    expect(eventCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ providerEventId: 'event-1', eventType: 'delivered' }),
    }));
    expect(recipientUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'DELIVERED' }),
    }));
  });
});
