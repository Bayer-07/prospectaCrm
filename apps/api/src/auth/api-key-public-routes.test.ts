import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { AuthCacheService } from './auth-cache.service.js';
import { AuthGuard } from './auth.guard.js';

function context(path: string) {
  const request = {
    headers: { authorization: 'Bearer pk_test_only' },
    originalUrl: path,
    method: 'GET',
  };
  const db = {
    apiKey: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'key-1',
        organizationId: 'org-1',
        name: 'MCP',
        scopes: ['workflows:read'],
        expiresAt: null,
        revokedAt: null,
        lastUsedAt: new Date(),
      }),
    },
  };
  const guard = new AuthGuard(new Reflector(), db as never, new AuthCacheService(), {} as never);
  const executionContext = {
    getType: () => 'http',
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}) }),
  } as never;
  return { guard, executionContext };
}

describe('rotas públicas para API Key', () => {
  it('permite acessar a API de chatbots pelo MCP', async () => {
    const { guard, executionContext } = context('/api/v1/chatbots/metadata');
    await expect(guard.canActivate(executionContext)).resolves.toBe(true);
  });
});
