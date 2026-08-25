export function campaignEmailConfigurationStatus(env: NodeJS.ProcessEnv = process.env) {
  const smtpRequested = [
    env.CAMPAIGN_SMTP_HOST,
    env.CAMPAIGN_SMTP_PORT,
    env.CAMPAIGN_SMTP_USER,
    env.CAMPAIGN_SMTP_PASSWORD,
  ].some((value) => Boolean(value?.trim()));

  if (!smtpRequested && (env.CAMPAIGN_GMAIL_USER?.trim() || env.CAMPAIGN_GMAIL_APP_PASSWORD?.trim())) {
    const required = {
      CAMPAIGN_GMAIL_USER: env.CAMPAIGN_GMAIL_USER,
      CAMPAIGN_GMAIL_APP_PASSWORD: env.CAMPAIGN_GMAIL_APP_PASSWORD,
    };
    const missing = missingVariables(required);
    return {
      provider: 'gmail' as const,
      configured: missing.length === 0,
      fromEmail: env.CAMPAIGN_GMAIL_USER?.trim() || null,
      fromName: env.CAMPAIGN_GMAIL_FROM_NAME?.trim() || 'BZS Tecnologia',
      smtpHost: 'smtp.gmail.com',
      smtpPort: 465,
      smtpSecurity: 'tls' as const,
      saveSent: false,
      imapHost: null,
      missing,
    };
  }

  const saveSent = parseBoolean(env.CAMPAIGN_IMAP_SAVE_SENT, false);
  const required: Record<string, string | undefined> = {
    CAMPAIGN_SMTP_HOST: env.CAMPAIGN_SMTP_HOST,
    CAMPAIGN_SMTP_PORT: validPort(env.CAMPAIGN_SMTP_PORT) ? env.CAMPAIGN_SMTP_PORT : undefined,
    CAMPAIGN_SMTP_USER: env.CAMPAIGN_SMTP_USER,
    CAMPAIGN_SMTP_PASSWORD: env.CAMPAIGN_SMTP_PASSWORD,
  };
  if (saveSent) {
    required.CAMPAIGN_IMAP_HOST = env.CAMPAIGN_IMAP_HOST;
    required.CAMPAIGN_IMAP_PORT = validPort(env.CAMPAIGN_IMAP_PORT) ? env.CAMPAIGN_IMAP_PORT : undefined;
  }
  const missing = missingVariables(required);
  const smtpPort = validPort(env.CAMPAIGN_SMTP_PORT) ? Number(env.CAMPAIGN_SMTP_PORT) : null;
  const secure = parseBoolean(env.CAMPAIGN_SMTP_SECURE, smtpPort === 465);

  return {
    provider: 'smtp' as const,
    configured: missing.length === 0,
    fromEmail: env.CAMPAIGN_SMTP_FROM_EMAIL?.trim() || env.CAMPAIGN_SMTP_USER?.trim() || null,
    fromName: env.CAMPAIGN_SMTP_FROM_NAME?.trim() || 'BZS Tecnologia',
    smtpHost: env.CAMPAIGN_SMTP_HOST?.trim() || null,
    smtpPort,
    smtpSecurity: secure ? 'tls' as const : 'starttls' as const,
    saveSent,
    imapHost: saveSent ? env.CAMPAIGN_IMAP_HOST?.trim() || null : null,
    missing,
  };
}

function missingVariables(required: Record<string, string | undefined>) {
  return Object.entries(required)
    .filter(([, value]) => !value?.trim())
    .map(([key]) => key);
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined || value.trim() === '') return fallback;
  return ['1', 'true', 'yes', 'sim', 'on'].includes(value.trim().toLocaleLowerCase('en-US'));
}

function validPort(value: string | undefined) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65_535;
}
