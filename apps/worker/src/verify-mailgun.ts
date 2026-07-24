import FormData from 'form-data';
import Mailgun from 'mailgun.js';
import { loadMailgunConfig } from './mailgun-client.js';

const config = loadMailgunConfig();
if (!config) {
  console.error(JSON.stringify({
    ok: false,
    message: 'Preencha MAILGUN_API_KEY, MAILGUN_DOMAIN e MAILGUN_FROM_EMAIL.',
  }));
  process.exit(1);
}

const mailgun = new Mailgun.default(FormData);
const messages = mailgun.client({
  username: 'api',
  key: config.apiKey,
  url: config.baseUrl,
}).messages;

try {
  const result = await messages.create(config.domain, {
    from: `${config.fromName} <${config.fromEmail}>`,
    to: [process.env.MAILGUN_TEST_RECIPIENT?.trim() || config.fromEmail],
    subject: 'Validação de configuração do BZS One',
    text: 'Teste técnico do Mailgun sem entrega ao destinatário.',
    'o:testmode': 'yes',
  });

  console.log(JSON.stringify({
    ok: true,
    status: result.status,
    accepted: Boolean(result.id),
    message: result.message,
    domain: config.domain,
    region: config.region,
  }));
} catch (error) {
  const failure = error as {
    status?: number;
    details?: string;
    message?: string;
  };
  console.error(JSON.stringify({
    ok: false,
    status: failure.status || null,
    details: failure.details || failure.message || String(error),
    domain: config.domain,
    region: config.region,
  }));
  process.exit(1);
}
