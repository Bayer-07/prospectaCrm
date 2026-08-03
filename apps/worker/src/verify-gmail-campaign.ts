import { GmailCampaignClient, loadGmailCampaignConfig } from './gmail-campaign-client.js';

const config = loadGmailCampaignConfig();
if (!config) {
  console.error(JSON.stringify({
    ok: false,
    message: 'Preencha CAMPAIGN_GMAIL_USER e CAMPAIGN_GMAIL_APP_PASSWORD.',
  }));
  process.exit(1);
}

try {
  await new GmailCampaignClient(config).verify();
  console.log(JSON.stringify({ ok: true, provider: 'gmail', fromEmail: config.user }));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    provider: 'gmail',
    message: error instanceof Error ? error.message : String(error),
  }));
  process.exit(1);
}
