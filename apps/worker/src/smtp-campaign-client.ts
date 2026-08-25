import { setTimeout as delay } from 'node:timers/promises';
import { ImapFlow, type ImapFlowOptions, type ListResponse } from 'imapflow';
import nodemailer, { type SendMailOptions } from 'nodemailer';

export type ImapSentMailboxConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  mailbox?: string;
};

export type SmtpCampaignConfig = {
  provider: 'smtp' | 'gmail';
  host: string;
  port: number;
  secure: boolean;
  requireTls: boolean;
  user: string;
  password: string;
  fromEmail: string;
  fromName: string;
  replyTo: string;
  sentMailbox: ImapSentMailboxConfig | null;
};

export type SmtpCampaignSendInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  campaignId: string;
  recipientId: string;
  contactId: string;
};

type MailTransport = {
  sendMail(input: SendMailOptions): Promise<{ messageId?: string; response?: string }>;
  verify(): Promise<unknown>;
};

type RawMessageTransport = {
  sendMail(input: SendMailOptions): Promise<{
    messageId: string;
    message: Buffer | NodeJS.ReadableStream;
  }>;
};

export type SentMailbox = {
  verify(): Promise<{ mailbox: string }>;
  append(message: Buffer, sentAt: Date): Promise<{ mailbox: string }>;
};

type ImapClient = Pick<ImapFlow, 'connect' | 'list' | 'append' | 'logout' | 'close' | 'usable' | 'on'>;
type ImapClientFactory = (options: ImapFlowOptions) => ImapClient;

export class CampaignEmailError extends Error {
  constructor(
    readonly retryable: boolean,
    message: string,
  ) {
    super(message);
    this.name = 'CampaignEmailError';
  }
}

export function loadSmtpCampaignConfig(env: NodeJS.ProcessEnv = process.env): SmtpCampaignConfig | null {
  const smtpRequested = [
    env.CAMPAIGN_SMTP_HOST,
    env.CAMPAIGN_SMTP_PORT,
    env.CAMPAIGN_SMTP_USER,
    env.CAMPAIGN_SMTP_PASSWORD,
  ].some((value) => Boolean(value?.trim()));

  if (!smtpRequested) return loadLegacyGmailConfig(env);

  const host = env.CAMPAIGN_SMTP_HOST?.trim();
  const port = parsePort(env.CAMPAIGN_SMTP_PORT);
  const user = env.CAMPAIGN_SMTP_USER?.trim();
  const password = env.CAMPAIGN_SMTP_PASSWORD;
  if (!host || !port || !user || !password) return null;

  const secure = parseBoolean(env.CAMPAIGN_SMTP_SECURE, port === 465);
  const saveSent = parseBoolean(env.CAMPAIGN_IMAP_SAVE_SENT, false);
  let sentMailbox: ImapSentMailboxConfig | null = null;
  if (saveSent) {
    const imapHost = env.CAMPAIGN_IMAP_HOST?.trim();
    const imapPort = parsePort(env.CAMPAIGN_IMAP_PORT);
    if (!imapHost || !imapPort) return null;
    sentMailbox = {
      host: imapHost,
      port: imapPort,
      secure: parseBoolean(env.CAMPAIGN_IMAP_SECURE, imapPort === 993),
      user: env.CAMPAIGN_IMAP_USER?.trim() || user,
      password: env.CAMPAIGN_IMAP_PASSWORD || password,
      mailbox: env.CAMPAIGN_IMAP_SENT_MAILBOX?.trim() || undefined,
    };
  }

  return {
    provider: 'smtp',
    host,
    port,
    secure,
    requireTls: parseBoolean(env.CAMPAIGN_SMTP_REQUIRE_TLS, !secure),
    user,
    password,
    fromEmail: env.CAMPAIGN_SMTP_FROM_EMAIL?.trim() || user,
    fromName: env.CAMPAIGN_SMTP_FROM_NAME?.trim() || 'BZS Tecnologia',
    replyTo: env.CAMPAIGN_SMTP_REPLY_TO?.trim() || user,
    sentMailbox,
  };
}

function loadLegacyGmailConfig(env: NodeJS.ProcessEnv): SmtpCampaignConfig | null {
  const user = env.CAMPAIGN_GMAIL_USER?.trim();
  const password = env.CAMPAIGN_GMAIL_APP_PASSWORD?.replace(/[\s-]+/g, '');
  if (!user || !password) return null;
  return {
    provider: 'gmail',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    requireTls: true,
    user,
    password,
    fromEmail: user,
    fromName: env.CAMPAIGN_GMAIL_FROM_NAME?.trim() || 'BZS Tecnologia',
    replyTo: user,
    sentMailbox: null,
  };
}

export class ImapSentMailbox implements SentMailbox {
  constructor(
    private readonly config: ImapSentMailboxConfig,
    private readonly createClient: ImapClientFactory = (options) => new ImapFlow(options),
  ) {}

  async verify() {
    return this.withClient(async (client) => ({ mailbox: await this.resolveMailbox(client) }));
  }

  async append(message: Buffer, sentAt: Date) {
    return this.withClient(async (client) => {
      const mailbox = await this.resolveMailbox(client);
      const result = await client.append(mailbox, message, ['\\Seen'], sentAt);
      if (!result) throw new Error(`O servidor IMAP não confirmou a cópia em ${mailbox}`);
      return { mailbox };
    });
  }

  private async withClient<T>(callback: (client: ImapClient) => Promise<T>): Promise<T> {
    const client = this.createClient({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      auth: { user: this.config.user, pass: this.config.password },
      logger: false,
      disableAutoIdle: true,
    });
    client.on('error', () => undefined);
    try {
      await client.connect();
      return await callback(client);
    } finally {
      if (client.usable) {
        await client.logout().catch(() => client.close());
      } else {
        client.close();
      }
    }
  }

  private async resolveMailbox(client: Pick<ImapClient, 'list'>) {
    const mailboxes = await client.list(
      this.config.mailbox ? { specialUseHints: { sent: this.config.mailbox } } : undefined,
    );
    if (this.config.mailbox) {
      const configured = mailboxes.find((mailbox) => mailbox.path.toLocaleLowerCase('pt-BR') === this.config.mailbox!.toLocaleLowerCase('pt-BR'));
      if (!configured) throw new Error(`A pasta IMAP configurada não existe: ${this.config.mailbox}`);
      return configured.path;
    }

    const specialUse = mailboxes.find((mailbox) => mailbox.specialUse === '\\Sent');
    if (specialUse) return specialUse.path;

    const knownNames = new Set(['sent', 'sent items', 'sent messages', 'enviados', 'enviadas', 'itens enviados']);
    const localized = mailboxes.find((mailbox) => knownNames.has(normalizeMailboxName(mailbox)));
    if (localized) return localized.path;
    throw new Error('A pasta de enviados não foi encontrada no servidor IMAP');
  }
}

export class SmtpCampaignClient {
  private readonly transport?: MailTransport;
  private readonly rawTransport?: RawMessageTransport;
  private readonly sentMailbox?: SentMailbox;

  constructor(
    private readonly config = loadSmtpCampaignConfig(),
    transport?: MailTransport,
    sentMailbox?: SentMailbox,
    rawTransport?: RawMessageTransport,
  ) {
    if (!config) return;
    this.transport = transport || nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      requireTLS: config.requireTls,
      pool: true,
      maxConnections: 1,
      maxMessages: 100,
      auth: {
        user: config.user,
        pass: config.password,
      },
    });
    this.rawTransport = rawTransport || nodemailer.createTransport({
      streamTransport: true,
      buffer: true,
      newline: 'windows',
    }) as unknown as RawMessageTransport;
    this.sentMailbox = sentMailbox || (config.sentMailbox ? new ImapSentMailbox(config.sentMailbox) : undefined);
  }

  get configured() {
    return Boolean(this.config);
  }

  async verify() {
    this.ensureConfigured();
    await this.transport!.verify();
    const sent = this.sentMailbox ? await this.sentMailbox.verify() : null;
    return { provider: this.config!.provider, sentMailbox: sent?.mailbox || null };
  }

  async send(input: SmtpCampaignSendInput) {
    this.ensureConfigured();

    const unsubscribeUrl = `mailto:${this.config!.replyTo}?subject=${encodeURIComponent('Descadastro de campanhas')}`;
    const html = input.html.replaceAll('%unsubscribe_url%', unsubscribeUrl);
    const text = input.text.replaceAll('%unsubscribe_url%', unsubscribeUrl);
    const sentAt = new Date();
    const mailOptions: SendMailOptions = {
      from: { name: this.config!.fromName, address: this.config!.fromEmail },
      replyTo: this.config!.replyTo,
      to: input.to,
      subject: input.subject,
      html,
      text,
      date: sentAt,
      headers: {
        'X-BZS-One-Campaign-Id': input.campaignId,
        'X-BZS-One-Recipient-Id': input.recipientId,
        'X-BZS-One-Contact-Id': input.contactId,
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
      },
    };

    try {
      const compiled = await this.rawTransport!.sendMail(mailOptions);
      if (!Buffer.isBuffer(compiled.message)) throw new Error('Não foi possível preparar o conteúdo MIME do e-mail');
      const result = await this.transport!.sendMail({
        envelope: { from: this.config!.fromEmail, to: [input.to] },
        raw: compiled.message,
      });
      const messageId = normalizeSmtpMessageId(result.messageId || compiled.messageId);
      if (!messageId) throw new Error('O servidor SMTP aceitou o envio sem retornar o Message-ID');

      let sentCopyError: string | undefined;
      if (this.sentMailbox) {
        sentCopyError = await this.appendSentCopy(compiled.message, sentAt);
      }
      return {
        id: messageId,
        message: result.response || 'Enviado',
        sentCopySaved: Boolean(this.sentMailbox) && !sentCopyError,
        sentCopyError,
      };
    } catch (error) {
      if (error instanceof CampaignEmailError) throw error;
      const rawResponseCode = (error as { responseCode?: unknown })?.responseCode;
      const responseCode = typeof rawResponseCode === 'number' ? rawResponseCode : 0;
      const rawCode = (error as { code?: unknown })?.code;
      const code = typeof rawCode === 'string' ? rawCode : 'SMTP_ERROR';
      const retryable = (responseCode >= 400 && responseCode < 500)
        || ['ECONNECTION', 'ETIMEDOUT', 'ESOCKET'].includes(code);
      const reportedMessage = (error as { message?: unknown })?.message;
      const detail = errorDetail(error, reportedMessage);
      const responseSuffix = responseCode ? ` ${responseCode}` : '';
      throw new CampaignEmailError(
        retryable,
        `SMTP${responseSuffix}: ${detail}`.slice(0, 500),
      );
    }
  }

  private async appendSentCopy(message: Buffer, sentAt: Date) {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await this.sentMailbox!.append(message, sentAt);
        return undefined;
      } catch (error) {
        lastError = error;
        if (attempt < 3) await delay(attempt * 500);
      }
    }
    return `E-mail enviado, mas a cópia em Enviados falhou: ${errorDetail(lastError, undefined)}`.slice(0, 500);
  }

  private ensureConfigured() {
    if (!this.config) {
      throw new CampaignEmailError(
        false,
        'SMTP de campanhas não configurado. Preencha as variáveis CAMPAIGN_SMTP_*.',
      );
    }
    if (!this.transport || !this.rawTransport) {
      throw new CampaignEmailError(false, 'O cliente SMTP de campanhas não foi inicializado');
    }
  }
}

function normalizeMailboxName(mailbox: ListResponse) {
  return mailbox.name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLocaleLowerCase('pt-BR');
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined || value.trim() === '') return fallback;
  return ['1', 'true', 'yes', 'sim', 'on'].includes(value.trim().toLocaleLowerCase('en-US'));
}

function parsePort(value: string | undefined) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : null;
}

function errorDetail(error: unknown, reportedMessage: unknown) {
  if (typeof reportedMessage === 'string') return reportedMessage;
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : 'Falha desconhecida';
}

export function normalizeSmtpMessageId(value?: string | null) {
  return String(value || '').trim().replace(/^<|>$/g, '');
}
