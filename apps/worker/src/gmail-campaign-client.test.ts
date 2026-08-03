import { describe, expect, it, vi } from 'vitest';
import {
  GmailCampaignClient,
  GmailCampaignError,
  loadGmailCampaignConfig,
  normalizeSmtpMessageId,
} from './gmail-campaign-client.js';

describe('GmailCampaignClient', () => {
  const config = {
    user: 'campanhas@example.com',
    appPassword: 'abcdefghijklmnop',
    fromName: 'Comercial BZS',
  };

  it('remove separadores visuais da senha de app', () => {
    expect(loadGmailCampaignConfig({
      CAMPAIGN_GMAIL_USER: ' campanhas@example.com ',
      CAMPAIGN_GMAIL_APP_PASSWORD: 'abcd-efgh ijkl-mnop',
    } as NodeJS.ProcessEnv)).toMatchObject({
      user: 'campanhas@example.com',
      appPassword: 'abcdefghijklmnop',
    });
  });

  it('envia a campanha pelo endereço autenticado e substitui o descadastro', async () => {
    const sendMail = vi.fn().mockResolvedValue({
      messageId: '<message-id@gmail.com>',
      response: '250 2.0.0 OK',
    });
    const client = new GmailCampaignClient(config, { sendMail, verify: vi.fn() } as never);

    const result = await client.send({
      to: 'cliente@example.com',
      subject: 'Olá',
      html: '<a href="%unsubscribe_url%">Sair</a>',
      text: 'Sair: %unsubscribe_url%',
      campaignId: 'campaign-1',
      recipientId: 'recipient-1',
      contactId: 'contact-1',
    });

    expect(result.id).toBe('message-id@gmail.com');
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: { name: 'Comercial BZS', address: 'campanhas@example.com' },
      replyTo: 'campanhas@example.com',
      to: 'cliente@example.com',
      html: expect.not.stringContaining('%unsubscribe_url%'),
      headers: expect.objectContaining({
        'X-BZS-One-Campaign-Id': 'campaign-1',
        'List-Unsubscribe': expect.stringContaining('mailto:campanhas@example.com'),
      }),
    }));
  });

  it('classifica erro SMTP 4xx como temporário', async () => {
    const client = new GmailCampaignClient(config, {
      sendMail: vi.fn().mockRejectedValue({ responseCode: 421, message: 'Try again later' }),
      verify: vi.fn(),
    } as never);

    await expect(client.send({
      to: 'cliente@example.com',
      subject: 'Teste',
      html: '<p>Teste</p>',
      text: 'Teste',
      campaignId: 'campaign-1',
      recipientId: 'recipient-1',
      contactId: 'contact-1',
    })).rejects.toEqual(new GmailCampaignError(true, 'Gmail SMTP 421: Try again later'));
  });

  it('normaliza o Message-ID retornado pelo SMTP', () => {
    expect(normalizeSmtpMessageId('<abc@gmail.com>')).toBe('abc@gmail.com');
  });
});
