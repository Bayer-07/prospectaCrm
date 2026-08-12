import FormData from 'form-data';
import Mailgun, { type MailgunMessageData, type MessagesSendResult } from 'mailgun.js';

export type MailgunRegion = 'US' | 'EU';

export type MailgunConfig = {
  apiKey: string;
  domain: string;
  fromEmail: string;
  fromName: string;
  region: MailgunRegion;
  baseUrl: string;
};

export type MailgunSendInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  campaignId: string;
  recipientId: string;
  contactId: string;
};

export type MailgunTaskDigestInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  userId: string;
  digestDate: string;
};

export type MailgunUserInviteInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  inviteTokenId: string;
  userId: string;
};

export type MailgunPasswordResetInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  passwordResetTokenId: string;
  userId: string;
};

export class MailgunRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'MailgunRequestError';
  }
}

export function loadMailgunConfig(env: NodeJS.ProcessEnv = process.env): MailgunConfig | null {
  const apiKey = env.MAILGUN_API_KEY?.trim();
  const domain = env.MAILGUN_DOMAIN?.trim();
  const fromEmail = env.MAILGUN_FROM_EMAIL?.trim();
  if (!apiKey || !domain || !fromEmail) return null;

  const region = env.MAILGUN_REGION?.trim().toUpperCase() === 'EU' ? 'EU' : 'US';
  return {
    apiKey,
    domain,
    fromEmail,
    fromName: env.MAILGUN_FROM_NAME?.trim() || 'BZS Tecnologia',
    region,
    baseUrl: env.MAILGUN_BASE_URL?.trim()
      || (region === 'EU' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net'),
  };
}

export class MailgunClient {
  private readonly messages?: {
    create(domain: string, data: MailgunMessageData): Promise<MessagesSendResult>;
  };

  constructor(
    private readonly config = loadMailgunConfig(),
    messages?: {
      create(domain: string, data: MailgunMessageData): Promise<MessagesSendResult>;
    },
  ) {
    if (messages) {
      this.messages = messages;
      return;
    }
    if (!config) return;
    const mailgun = new Mailgun.default(FormData);
    this.messages = mailgun.client({
      username: 'api',
      key: config.apiKey,
      url: config.baseUrl,
    }).messages;
  }

  get configured() {
    return Boolean(this.config);
  }

  async send(input: MailgunSendInput) {
    return this.sendMessage({
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      tag: `bzs-campaign-${input.campaignId}`,
      variables: {
        'campaign-id': input.campaignId,
        'recipient-id': input.recipientId,
        'contact-id': input.contactId,
      },
    });
  }

  async sendTaskDigest(input: MailgunTaskDigestInput) {
    return this.sendMessage({
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      tag: 'bzs-task-digest',
      variables: {
        'task-digest-user-id': input.userId,
        'task-digest-date': input.digestDate,
      },
    });
  }

  async sendUserInvite(input: MailgunUserInviteInput) {
    return this.sendMessage({
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      tag: 'bzs-user-invite',
      trackingClicks: false,
      variables: {
        'invite-token-id': input.inviteTokenId,
        'user-id': input.userId,
      },
    });
  }

  async sendPasswordReset(input: MailgunPasswordResetInput) {
    return this.sendMessage({
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      tag: 'bzs-password-reset',
      trackingClicks: false,
      variables: {
        'password-reset-token-id': input.passwordResetTokenId,
        'user-id': input.userId,
      },
    });
  }

  private async sendMessage(input: {
    to: string;
    subject: string;
    html: string;
    text: string;
    tag: string;
    trackingClicks?: boolean;
    variables: Record<string, string>;
  }) {
    if (!this.config) {
      throw new Error('Mailgun não configurado. Preencha MAILGUN_API_KEY, MAILGUN_DOMAIN e MAILGUN_FROM_EMAIL.');
    }

    if (!this.messages) throw new Error('O cliente do Mailgun não foi inicializado');

    let result: MessagesSendResult;
    try {
      result = await this.messages.create(this.config.domain, {
        from: `${this.config.fromName} <${this.config.fromEmail}>`,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        'o:tracking': 'yes',
        'o:tracking-opens': 'yes',
        'o:tracking-clicks': input.trackingClicks === false ? 'no' : 'yes',
        'o:tag': input.tag,
        ...Object.fromEntries(
          Object.entries(input.variables).map(([key, value]) => [`v:${key}`, value]),
        ),
      });
    } catch (error) {
      const status = typeof (error as { status?: unknown })?.status === 'number'
        ? (error as { status: number }).status
        : 500;
      const reportedDetails = (error as { details?: unknown })?.details;
      const detail = mailgunErrorDetail(reportedDetails, error);
      throw new MailgunRequestError(
        status,
        `Mailgun ${status}: ${detail}`.slice(0, 500),
      );
    }
    if (!result.id) throw new Error('O Mailgun aceitou a requisição sem retornar o ID da mensagem');

    return {
      id: normalizeMailgunMessageId(result.id),
      message: result.message || 'Queued',
    };
  }
}

function mailgunErrorDetail(reportedDetails: unknown, error: unknown) {
  if (typeof reportedDetails === 'string') return reportedDetails;
  return error instanceof Error ? error.message : 'Falha desconhecida';
}

export function normalizeMailgunMessageId(value?: string | null) {
  return String(value || '').trim().replace(/^<|>$/g, '');
}
