import { describe, expect, it } from 'vitest';
import { AuthCacheService, type CachedSessionAuth } from './auth-cache.service.js';

const session = (overrides: Partial<CachedSessionAuth> = {}): CachedSessionAuth => ({
  sessionId: 'session-1',
  userId: 'user-1',
  roleId: 'role-1',
  csrfHash: 'csrf',
  expiresAt: new Date('2030-01-01T00:00:00Z'),
  lastSeenAt: new Date('2026-01-01T00:00:00Z'),
  auth: {
    type: 'session',
    organizationId: 'organization-1',
    userId: 'user-1',
    name: 'Usuário',
    permissions: [],
  },
  ...overrides,
});

describe('cache curto de autenticação', () => {
  it('reutiliza a sessão dentro do TTL e respeita a expiração real', () => {
    const cache = new AuthCacheService();
    const now = Date.parse('2026-01-01T00:00:00Z');
    cache.setSession('token', session(), now);
    expect(cache.getSession('token', now + 1_000)?.sessionId).toBe('session-1');

    cache.setSession('expiring', session({ expiresAt: new Date(now + 500) }), now);
    expect(cache.getSession('expiring', now + 501)).toBeUndefined();
  });

  it('invalida todas as sessões afetadas por uma mudança de usuário ou papel', () => {
    const cache = new AuthCacheService();
    const now = Date.parse('2026-01-01T00:00:00Z');
    cache.setSession('first', session(), now);
    cache.setSession('second', session({ sessionId: 'session-2' }), now);
    cache.invalidateUser('user-1');
    expect(cache.getSession('first', now)).toBeUndefined();
    expect(cache.getSession('second', now)).toBeUndefined();

    cache.setSession('third', session(), now);
    cache.invalidateRole('role-1');
    expect(cache.getSession('third', now)).toBeUndefined();
  });
});
