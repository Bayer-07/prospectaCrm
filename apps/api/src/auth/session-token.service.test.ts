import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionTokenService } from './session-token.service.js';

const originalJwtSecret = process.env.JWT_SECRET;

describe('SessionTokenService', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'jwt-test-secret-with-more-than-thirty-two-characters';
  });

  afterEach(() => {
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
  });

  it('emite um JWT assinado com usuário, sessão e expiração', async () => {
    const service = new SessionTokenService();
    const expiresAt = new Date(Date.now() + 60_000);
    const token = await service.issue({
      sessionId: '4b69328c-ce86-4ccd-823e-8508b5a1e750',
      userId: 'f7c557c8-2fe1-430b-92aa-66d09c73ec39',
      expiresAt,
    });

    expect(token.split('.')).toHaveLength(3);
    await expect(service.verify(token)).resolves.toMatchObject({
      sessionId: '4b69328c-ce86-4ccd-823e-8508b5a1e750',
      userId: 'f7c557c8-2fe1-430b-92aa-66d09c73ec39',
    });
  });

  it('rejeita JWT adulterado ou expirado', async () => {
    const service = new SessionTokenService();
    const valid = await service.issue({
      sessionId: '4b69328c-ce86-4ccd-823e-8508b5a1e750',
      userId: 'f7c557c8-2fe1-430b-92aa-66d09c73ec39',
      expiresAt: new Date(Date.now() + 60_000),
    });
    const expired = await service.issue({
      sessionId: '4b69328c-ce86-4ccd-823e-8508b5a1e750',
      userId: 'f7c557c8-2fe1-430b-92aa-66d09c73ec39',
      expiresAt: new Date(Date.now() - 10_000),
    });
    const replacement = valid.endsWith('a') ? 'b' : 'a';

    await expect(service.verify(`${valid.slice(0, -1)}${replacement}`)).resolves.toBeNull();
    await expect(service.verify(expired)).resolves.toBeNull();
  });
});
