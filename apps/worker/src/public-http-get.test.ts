import { describe, expect, it, vi } from 'vitest';
import { createPinnedLookup, publicHttpGet, publicHttpRequestHeaders } from './public-http-get.js';

describe('GET externo protegido', () => {
  it('bloqueia resolução DNS privada antes de abrir a requisição', async () => {
    const resolver = vi.fn().mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    await expect(publicHttpGet('https://hooks.example.com/event', { resolveAddresses: resolver })).rejects.toThrow('interno bloqueado');
    expect(resolver).toHaveBeenCalledOnce();
  });

  it('fixa o lookup nos endereços previamente validados', async () => {
    const lookup = createPinnedLookup([{ address: '8.8.8.8', family: 4 }]);
    const callback = vi.fn();
    lookup('hooks.example.com', { family: 4, all: false }, callback);
    expect(callback).toHaveBeenCalledWith(null, '8.8.8.8', 4);
  });

  it('identifica o cliente HTTP por padrão e permite sobrescrever o User-Agent', () => {
    expect(publicHttpRequestHeaders({ accept: 'application/json' })).toEqual({
      accept: 'application/json',
      'user-agent': 'BZS-One/1.0',
    });
    expect(publicHttpRequestHeaders({ 'User-Agent': 'Minha-Integracao/2.0' })).toEqual({
      'User-Agent': 'Minha-Integracao/2.0',
    });
  });
});
