import { describe, expect, it, vi } from 'vitest';
import {
  loadMailgunConfig,
  MailgunClient,
  MailgunRequestError,
  normalizeMailgunMessageId,
} from './mailgun-client.js';

describe('MailgunClient', () => {
  it('seleciona o endpoint europeu quando configurado', () => {
    expect(loadMailgunConfig({
      MAILGUN_API_KEY: 'key',
      MAILGUN_DOMAIN: 'mg.example.com',
      MAILGUN_FROM_EMAIL: 'contato@example.com',
      MAILGUN_REGION: 'EU',
    } as NodeJS.ProcessEnv)?.baseUrl).toBe('https://api.eu.mailgun.net');
  });

  it('envia multipart com autenticação e metadados de correlação', async () => {
    const create = vi.fn().mockResolvedValue({
      id: '<message-id@mg.example.com>',
      message: 'Queued. Thank you.',
      status: 200,
    });
    const client = new MailgunClient({
      apiKey: 'secret',
      domain: 'mg.example.com',
      fromEmail: 'contato@example.com',
      fromName: 'BZS',
      region: 'US',
      baseUrl: 'https://api.mailgun.net',
    }, { create });

    const result = await client.send({
      to: 'cliente@example.com',
      subject: 'Olá',
      html: '<p>Olá</p>',
      text: 'Olá',
      campaignId: 'campaign-1',
      recipientId: 'recipient-1',
      contactId: 'contact-1',
    });

    expect(result.id).toBe('message-id@mg.example.com');
    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith('mg.example.com', expect.objectContaining({
      from: 'BZS <contato@example.com>',
      to: ['cliente@example.com'],
      'v:recipient-id': 'recipient-1',
      'o:tracking-opens': 'yes',
    }));
  });

  it('normaliza o Message-ID retornado pelo provedor', () => {
    expect(normalizeMailgunMessageId('<abc@example.com>')).toBe('abc@example.com');
  });

  it('preserva o status e o detalhe retornados pelo Mailgun', async () => {
    const client = new MailgunClient({
      apiKey: 'invalid',
      domain: 'mg.example.com',
      fromEmail: 'contato@example.com',
      fromName: 'BZS',
      region: 'US',
      baseUrl: 'https://api.mailgun.net',
    }, {
      create: vi.fn().mockRejectedValue({ status: 401, details: 'Forbidden' }),
    });

    await expect(client.send({
      to: 'cliente@example.com',
      subject: 'Teste',
      html: '<p>Teste</p>',
      text: 'Teste',
      campaignId: 'campaign-1',
      recipientId: 'recipient-1',
      contactId: 'contact-1',
    })).rejects.toEqual(new MailgunRequestError(401, 'Mailgun 401: Forbidden'));
  });

  it('envia o resumo diário com metadados próprios', async () => {
    const create = vi.fn().mockResolvedValue({
      id: '<digest@mg.example.com>',
      message: 'Queued',
      status: 200,
    });
    const client = new MailgunClient({
      apiKey: 'secret',
      domain: 'mg.example.com',
      fromEmail: 'contato@example.com',
      fromName: 'BZS',
      region: 'US',
      baseUrl: 'https://api.mailgun.net',
    }, { create });

    await client.sendTaskDigest({
      to: 'responsavel@example.com',
      subject: 'Tarefas de hoje',
      html: '<p>Tarefas</p>',
      text: 'Tarefas',
      userId: 'user-1',
      digestDate: '2026-07-24',
    });

    expect(create).toHaveBeenCalledWith('mg.example.com', expect.objectContaining({
      'o:tag': 'bzs-task-digest',
      'v:task-digest-user-id': 'user-1',
    }));
  });
});
