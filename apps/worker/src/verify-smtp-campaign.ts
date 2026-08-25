import { loadSmtpCampaignConfig, SmtpCampaignClient } from './smtp-campaign-client.js';

const config = loadSmtpCampaignConfig();
if (!config) {
  console.error(JSON.stringify({
    ok: false,
    message: 'Preencha as variáveis CAMPAIGN_SMTP_* e, se habilitado, CAMPAIGN_IMAP_*.',
  }));
  process.exit(1);
}

try {
  const result = await new SmtpCampaignClient(config).verify();
  console.log(JSON.stringify({
    ok: true,
    provider: result.provider,
    fromEmail: config.fromEmail,
    smtp: `${config.host}:${config.port}`,
    sentMailbox: result.sentMailbox,
  }));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    provider: config.provider,
    message: error instanceof Error ? error.message : String(error),
  }));
  process.exit(1);
}
