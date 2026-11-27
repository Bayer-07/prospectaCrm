import type { IncomingMessage } from 'node:http';
import type { NestExpressApplication } from '@nestjs/platform-express';

export const DEFAULT_BODY_LIMIT = '100kb';
export const EVOLUTION_WEBHOOK_BODY_LIMIT = '25mb';

export function isEvolutionWebhookJson(req: IncomingMessage) {
  const path = (req.url || '').split('?')[0].replace(/\/+$/, '');
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  return path === '/webhooks/evolution' && contentType.includes('json');
}

/**
 * Substitui os parsers padrão do Nest (criar a aplicação com `bodyParser: false`).
 * Só o webhook da Evolution aceita corpos grandes: sincronizações e mensagens com
 * prévia passam de 100 KB, e um 413 faz a Evolution retentar o mesmo evento e
 * travar o recebimento. As demais rotas mantêm o limite padrão. O parser do
 * webhook roda primeiro; os seguintes ignoram a requisição já lida.
 */
export function configureBodyParsers(app: NestExpressApplication) {
  app.useBodyParser('json', { limit: EVOLUTION_WEBHOOK_BODY_LIMIT, type: isEvolutionWebhookJson });
  app.useBodyParser('json', { limit: DEFAULT_BODY_LIMIT });
  app.useBodyParser('urlencoded', { extended: true, limit: DEFAULT_BODY_LIMIT });
}
