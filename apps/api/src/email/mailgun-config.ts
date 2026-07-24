export function mailgunConfigurationStatus(env: NodeJS.ProcessEnv = process.env) {
  const required = {
    MAILGUN_API_KEY: env.MAILGUN_API_KEY,
    MAILGUN_DOMAIN: env.MAILGUN_DOMAIN,
    MAILGUN_FROM_EMAIL: env.MAILGUN_FROM_EMAIL,
  };
  const missing = Object.entries(required)
    .filter(([, value]) => !value?.trim())
    .map(([key]) => key);
  const region = env.MAILGUN_REGION?.trim().toUpperCase() === 'EU' ? 'EU' : 'US';
  return {
    provider: 'mailgun' as const,
    configured: missing.length === 0,
    webhookConfigured: Boolean(env.MAILGUN_WEBHOOK_SIGNING_KEY?.trim()),
    region,
    domain: env.MAILGUN_DOMAIN?.trim() || null,
    fromEmail: env.MAILGUN_FROM_EMAIL?.trim() || null,
    fromName: env.MAILGUN_FROM_NAME?.trim() || 'BZS Tecnologia',
    missing,
  };
}

