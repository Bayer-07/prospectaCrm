import 'reflect-metadata';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { PublicMessagesController } from '../integrations/public-messages.controller.js';
import { AuthCacheService } from './auth-cache.service.js';
import { AuthGuard } from './auth.guard.js';

function requestContext(path: string, scopes = ['conversations:write']) {
  const request = { headers: { authorization: 'Bearer pk_test_only' }, originalUrl: path, method: path.includes('/send') ? 'POST' : 'GET' };
  const db = {
    apiKey: {
      findUnique: vi.fn().mockResolvedValue({ id: 'key-1', organizationId: 'org-1', name: 'Integração', scopes, expiresAt: null, revokedAt: null, lastUsedAt: new Date() }),
    },
  };
  const guard = new AuthGuard(new Reflector(), db as never, new AuthCacheService(), {} as never);
  const context = {
    getType: () => 'http',
    getHandler: () => PublicMessagesController.prototype.send,
    getClass: () => PublicMessagesController,
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}) }),
  } as unknown as ExecutionContext;
  return { guard, context };
}

describe('AuthGuard na API de mensagens', () => {
  it.each(['send', 'users', 'teams', 'connections'])('permite a rota pública %s com o escopo de escrita', async (path) => {
    const { guard, context } = requestContext(`/api/v1/messages/${path}`);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it.each(['/api/v1/messages/private', '/api/v1/messages/send/private', '/api/v1/conversations', '/api/v1/users', '/api/v1/whatsapp/instances'])('mantém rotas internas bloqueadas para API Key: %s', async (path) => {
    const { guard, context } = requestContext(path);
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 403 });
  });

  it('bloqueia chave sem conversations:write mesmo com escrita em contatos', async () => {
    const { guard, context } = requestContext('/api/v1/messages/send', ['contacts:write']);
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 403 });
  });
});
