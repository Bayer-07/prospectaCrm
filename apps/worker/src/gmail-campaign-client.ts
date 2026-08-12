import nodemailer, { type Transporter } from 'nodemailer';

export type GmailCampaignConfig = {
  user: string;
  appPassword: string;
  fromName: string;
};

export type GmailCampaignSendInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  campaignId: string;
  recipientId: string;
  contactId: string;
};

type GmailTransport = Pick<Transporter, 'sendMail' | 'verify'>;

export class GmailCampaignError extends Error {
  constructor(
    readonly retryable: boolean,
    message: string,
  ) {
    super(message);
    this.name = 'GmailCampaignError';
  }
}

export function loadGmailCampaignConfig(env: NodeJS.ProcessEnv = process.env): GmailCampaignConfig | null {
  const user = env.CAMPAIGN_GMAIL_USER?.trim();
  const appPassword = env.CAMPAIGN_GMAIL_APP_PASSWORD?.replace(/[\s-]+/g, '');
  if (!user || !appPassword) return null;

  return {
    user,
    appPassword,
    fromName: env.CAMPAIGN_GMAIL_FROM_NAME?.trim() || 'BZS Tecnologia',
  };
}

export class GmailCampaignClient {
  private readonly transport?: GmailTransport;

  constructor(
    private readonly config = loadGmailCampaignConfig(),
    transport?: GmailTransport,
  ) {
    if (transport) {
      this.transport = transport;
      return;
    }
    if (!config) return;

    this.transport = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      pool: true,
      maxConnections: 1,
      maxMessages: 100,
      auth: {
        user: config.user,
        pass: config.appPassword,
      },
    });
  }

  get configured() {
    return Boolean(this.config);
  }

  async verify() {
    this.ensureConfigured();
    return this.transport!.verify();
  }

  async send(input: GmailCampaignSendInput) {
    this.ensureConfigured();

    const unsubscribeUrl = `mailto:${this.config!.user}?subject=${encodeURIComponent('Descadastro de campanhas')}`;
    const html = input.html.replaceAll('%unsubscribe_url%', unsubscribeUrl);
    const text = input.text.replaceAll('%unsubscribe_url%', unsubscribeUrl);

    try {
      const result = await this.transport!.sendMail({
        from: { name: this.config!.fromName, address: this.config!.user },
        replyTo: this.config!.user,
        to: input.to,
        subject: input.subject,
        html,
        text,
        headers: {
          'X-BZS-One-Campaign-Id': input.campaignId,
          'X-BZS-One-Recipient-Id': input.recipientId,
          'X-BZS-One-Contact-Id': input.contactId,
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
        },
      });
      if (!result.messageId) throw new Error('O Gmail aceitou o envio sem retornar o Message-ID');
      return { id: normalizeSmtpMessageId(result.messageId), message: result.response || 'Enviado' };
    } catch (error) {
      if (error instanceof GmailCampaignError) throw error;
      const rawResponseCode = (error as { responseCode?: unknown })?.responseCode;
      const responseCode = typeof rawResponseCode === 'number' ? rawResponseCode : 0;
      const rawCode = (error as { code?: unknown })?.code;
      const code = typeof rawCode === 'string' ? rawCode : 'SMTP_ERROR';
      const retryable = (responseCode >= 400 && responseCode < 500)
        || ['ECONNECTION', 'ETIMEDOUT', 'ESOCKET'].includes(code);
      const reportedMessage = (error as { message?: unknown })?.message;
      const detail = errorDetail(error, reportedMessage);
      const responseSuffix = responseCode ? ` ${responseCode}` : '';
      throw new GmailCampaignError(
        retryable,
        `Gmail SMTP${responseSuffix}: ${detail}`.slice(0, 500),
      );
    }
  }

  private ensureConfigured() {
    if (!this.config) {
      throw new GmailCampaignError(
        false,
        'Gmail de campanhas não configurado. Preencha CAMPAIGN_GMAIL_USER e CAMPAIGN_GMAIL_APP_PASSWORD.',
      );
    }
    if (!this.transport) throw new GmailCampaignError(false, 'O cliente SMTP do Gmail não foi inicializado');
  }
}

function errorDetail(error: unknown, reportedMessage: unknown) {
  if (typeof reportedMessage === 'string') return reportedMessage;
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : 'Falha desconhecida';
}

export function normalizeSmtpMessageId(value?: string | null) {
  return String(value || '').trim().replace(/^<|>$/g, '');
}
