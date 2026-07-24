import { describe, expect, it } from 'vitest';
import { parseAuthEvent } from './auth-session';

describe('sincronização de autenticação entre abas', () => {
  it('aceita somente eventos de autenticação válidos', () => {
    expect(parseAuthEvent(JSON.stringify({
      type: 'logout',
      at: 1_774_000_000_000,
      nonce: 'event-1',
    }))).toEqual({
      type: 'logout',
      at: 1_774_000_000_000,
      nonce: 'event-1',
    });
    expect(parseAuthEvent(JSON.stringify({ type: 'unknown', at: 1, nonce: 'x' }))).toBeNull();
    expect(parseAuthEvent('conteúdo inválido')).toBeNull();
    expect(parseAuthEvent(null)).toBeNull();
  });
});
