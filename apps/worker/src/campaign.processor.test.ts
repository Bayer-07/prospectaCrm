import { describe, expect, it, vi } from 'vitest';
import { CampaignProcessor, campaignMessageSequence } from './campaign.processor.js';

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
});

describe('campanhas de e-mail', () => {
  it('renderiza o modelo e envia pelo Mailgun', async () => {
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
      },
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const add = vi.fn().mockResolvedValue({});
    const send = vi.fn().mockResolvedValue({ id: 'mailgun-message-id' });
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
      data: expect.objectContaining({ status: 'SENT', providerMessageId: 'mailgun-message-id' }),
    }));
    expect(add).toHaveBeenCalledWith('dispatch-campaign', { campaignId: 'campaign-1' }, expect.any(Object));
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
