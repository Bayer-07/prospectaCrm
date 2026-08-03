export function campaignEmailConfigurationStatus(env: NodeJS.ProcessEnv = process.env) {
  const required = {
    CAMPAIGN_GMAIL_USER: env.CAMPAIGN_GMAIL_USER,
    CAMPAIGN_GMAIL_APP_PASSWORD: env.CAMPAIGN_GMAIL_APP_PASSWORD,
  };
  const missing = Object.entries(required)
    .filter(([, value]) => !value?.trim())
    .map(([key]) => key);

  return {
    provider: 'gmail' as const,
    configured: missing.length === 0,
    fromEmail: env.CAMPAIGN_GMAIL_USER?.trim() || null,
    fromName: env.CAMPAIGN_GMAIL_FROM_NAME?.trim() || 'BZS Tecnologia',
    missing,
  };
}
