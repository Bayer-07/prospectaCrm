import { describe, expect, it, vi } from 'vitest';
import {
  CampaignEmailError,
  ImapSentMailbox,
  loadSmtpCampaignConfig,
  normalizeSmtpMessageId,
  SmtpCampaignClient,
} from './smtp-campaign-client.js';

const uolConfig = {
  provider: 'smtp' as const,
  host: 'smtps.uhserver.com',
  port: 587,
  secure: false,
  requireTls: true,
  user: 'comercial@bzs.com.br',
  password: 'secret',
  fromEmail: 'comercial@bzs.com.br',
  fromName: 'Gabriel da BZS Tecnologia',
  replyTo: 'comercial@bzs.com.br',
  sentMailbox: {
    host: 'imap.uhserver.com',
    port: 993,
    secure: true,
    user: 'comercial@bzs.com.br',
    password: 'secret',
  },
};

describe('SmtpCampaignClient', () => {
  it('carrega SMTP UOL com STARTTLS e reutiliza as credenciais no IMAP', () => {
    expect(loadSmtpCampaignConfig({
      CAMPAIGN_SMTP_HOST: 'smtps.uhserver.com',
      CAMPAIGN_SMTP_PORT: '587',
      CAMPAIGN_SMTP_SECURE: 'false',
      CAMPAIGN_SMTP_REQUIRE_TLS: 'true',
      CAMPAIGN_SMTP_USER: ' comercial@bzs.com.br ',
      CAMPAIGN_SMTP_PASSWORD: 'secret',
      CAMPAIGN_SMTP_FROM_NAME: 'Gabriel da BZS Tecnologia',
      CAMPAIGN_IMAP_SAVE_SENT: 'true',
      CAMPAIGN_IMAP_HOST: 'imap.uhserver.com',
      CAMPAIGN_IMAP_PORT: '993',
      CAMPAIGN_IMAP_SECURE: 'true',
    } as NodeJS.ProcessEnv)).toEqual(uolConfig);
  });

  it('mantém compatibilidade temporária com a configuração antiga do Gmail', () => {
    expect(loadSmtpCampaignConfig({
      CAMPAIGN_GMAIL_USER: ' campanhas@example.com ',
      CAMPAIGN_GMAIL_APP_PASSWORD: 'abcd-efgh ijkl-mnop',
    } as NodeJS.ProcessEnv)).toMatchObject({
      provider: 'gmail',
      host: 'smtp.gmail.com',
      port: 465,
      user: 'campanhas@example.com',
      password: 'abcdefghijklmnop',
    });
  });

  it('envia o mesmo MIME pelo SMTP e salva uma cópia via IMAP', async () => {
    const sendMail = vi.fn().mockResolvedValue({
      messageId: '<message-id@bzs.com.br>',
      response: '250 2.0.0 OK',
    });
    const append = vi.fn().mockResolvedValue({ mailbox: 'Enviados' });
    const raw = Buffer.from('From: comercial@bzs.com.br\r\nSubject: Olá\r\n\r\nMensagem');
    const rawTransport = { sendMail: vi.fn().mockResolvedValue({ messageId: '<message-id@bzs.com.br>', message: raw }) };
    const client = new SmtpCampaignClient(
      uolConfig,
      { sendMail, verify: vi.fn() },
      { append, verify: vi.fn() },
      rawTransport,
    );

    const result = await client.send({
      to: 'cliente@example.com',
      subject: 'Olá',
      html: '<a href="%unsubscribe_url%">Sair</a>',
      text: 'Sair: %unsubscribe_url%',
      campaignId: 'campaign-1',
      recipientId: 'recipient-1',
      contactId: 'contact-1',
    });

    expect(result).toMatchObject({ id: 'message-id@bzs.com.br', sentCopySaved: true });
    expect(rawTransport.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: { name: 'Gabriel da BZS Tecnologia', address: 'comercial@bzs.com.br' },
      replyTo: 'comercial@bzs.com.br',
      to: 'cliente@example.com',
      html: expect.not.stringContaining('%unsubscribe_url%'),
      headers: expect.objectContaining({
        'X-BZS-One-Campaign-Id': 'campaign-1',
        'List-Unsubscribe': expect.stringContaining('mailto:comercial@bzs.com.br'),
      }),
    }));
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ raw }));
    expect(append).toHaveBeenCalledWith(raw, expect.any(Date));
  });

  it('não transforma falha da cópia IMAP em novo envio SMTP', async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: '<sent@bzs.com.br>', response: '250 OK' });
    const append = vi.fn().mockRejectedValue(new Error('IMAP indisponível'));
    const raw = Buffer.from('Subject: Teste\r\n\r\nMensagem');
    const client = new SmtpCampaignClient(
      uolConfig,
      { sendMail, verify: vi.fn() },
      { append, verify: vi.fn() },
      { sendMail: vi.fn().mockResolvedValue({ messageId: '<sent@bzs.com.br>', message: raw }) },
    );

    const result = await client.send({
      to: 'cliente@example.com',
      subject: 'Teste',
      html: '<p>Teste</p>',
      text: 'Teste',
      campaignId: 'campaign-1',
      recipientId: 'recipient-1',
      contactId: 'contact-1',
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(append).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ sentCopySaved: false, sentCopyError: expect.stringContaining('IMAP indisponível') });
  });

  it('classifica erro SMTP 4xx como temporário', async () => {
    const client = new SmtpCampaignClient(
      { ...uolConfig, sentMailbox: null },
      { sendMail: vi.fn().mockRejectedValue({ responseCode: 421, message: 'Try again later' }), verify: vi.fn() },
      undefined,
      { sendMail: vi.fn().mockResolvedValue({ messageId: '<id@bzs.com.br>', message: Buffer.from('message') }) },
    );

    await expect(client.send({
      to: 'cliente@example.com',
      subject: 'Teste',
      html: '<p>Teste</p>',
      text: 'Teste',
      campaignId: 'campaign-1',
      recipientId: 'recipient-1',
      contactId: 'contact-1',
    })).rejects.toEqual(new CampaignEmailError(true, 'SMTP 421: Try again later'));
  });

  it('normaliza o Message-ID retornado pelo SMTP', () => {
    expect(normalizeSmtpMessageId('<abc@bzs.com.br>')).toBe('abc@bzs.com.br');
  });
});

describe('ImapSentMailbox', () => {
  it('descobre a pasta marcada como Sent e anexa o MIME como lido', async () => {
    const append = vi.fn().mockResolvedValue({ uid: 10 });
    const client = {
      usable: true,
      on: vi.fn(),
      connect: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([{ path: 'Enviados', name: 'Enviados', specialUse: '\\Sent' }]),
      append,
      logout: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(),
    };
    const mailbox = new ImapSentMailbox(uolConfig.sentMailbox, () => client as never);
    const raw = Buffer.from('Subject: Teste\r\n\r\nMensagem');

    await expect(mailbox.append(raw, new Date('2026-08-25T12:00:00Z'))).resolves.toEqual({ mailbox: 'Enviados' });
    expect(append).toHaveBeenCalledWith('Enviados', raw, ['\\Seen'], new Date('2026-08-25T12:00:00Z'));
  });
});
