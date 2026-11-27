import 'reflect-metadata';
import { Body, Controller, Module, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureBodyParsers } from './body-parsers.js';

@Controller()
class EchoController {
  @Post('webhooks/evolution')
  webhook(@Body() body: Record<string, unknown>) { return { size: JSON.stringify(body).length }; }

  @Post('api/v1/echo')
  echo(@Body() body: Record<string, unknown>) { return body; }
}

@Module({ controllers: [EchoController] })
class EchoModule {}

describe('limites de corpo das requisições', () => {
  let app: NestExpressApplication;
  let baseUrl = '';
  const post = (path: string, body: string, contentType = 'application/json') => fetch(`${baseUrl}${path}`, {
    method: 'POST', headers: { 'content-type': contentType }, body,
  });
  const largePayload = { event: 'messages.upsert', data: { text: 'a'.repeat(460_000) } };

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(EchoModule, { bodyParser: false, logger: false });
    configureBodyParsers(app);
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(() => app.close());

  it('aceita eventos grandes da Evolution no webhook', async () => {
    const response = await post('/webhooks/evolution?x=1', JSON.stringify(largePayload));
    expect(response.status).toBe(201);
    expect((await response.json()).size).toBeGreaterThan(460_000);
  });

  it('mantém o limite padrão nas demais rotas', async () => {
    expect((await post('/api/v1/echo', JSON.stringify(largePayload))).status).toBe(413);
  });

  it('continua lendo JSON e formulários pequenos nas demais rotas', async () => {
    const json = await post('/api/v1/echo', JSON.stringify({ ok: true }));
    expect([json.status, await json.json()]).toEqual([201, { ok: true }]);
    const form = await post('/api/v1/echo', 'nome=Ana&itens[0]=a', 'application/x-www-form-urlencoded');
    expect([form.status, await form.json()]).toEqual([201, { nome: 'Ana', itens: ['a'] }]);
  });
});
