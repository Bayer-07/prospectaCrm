import { describe, expect, it, vi } from 'vitest';
import { isPublicAddress, normalizePublicHttpUrl, resolvePublicHttpUrl } from './public-http-url.js';

describe('proteção de URLs HTTP públicas', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '172.16.10.2',
    '192.168.1.10',
    '169.254.169.254',
    '100.64.0.1',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
  ])('bloqueia o endereço não público %s', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])('aceita o endereço público %s', (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it.each([
    'https://localhost/hook',
    'https://metadata.google.internal/computeMetadata/v1',
    'https://service.internal/hook',
    'file:///etc/passwd',
    'https://user:password@example.com/hook',
  ])('rejeita o endpoint proibido %s', (endpoint) => {
    expect(() => normalizePublicHttpUrl(endpoint)).toThrow();
  });

  it('rejeita hostname que resolve para qualquer endereço privado', async () => {
    const resolver = vi.fn().mockResolvedValue([
      { address: '203.0.113.10', family: 4 },
      { address: '169.254.169.254', family: 4 },
    ]);
    await expect(resolvePublicHttpUrl('https://hooks.example.com/event', resolver)).rejects.toThrow('interno bloqueado');
  });

  it('retorna somente os endereços públicos resolvidos para fixar a conexão', async () => {
    const resolver = vi.fn().mockResolvedValue([
      { address: '8.8.8.8', family: 4 },
      { address: '2606:4700:4700::1111', family: 6 },
    ]);
    const result = await resolvePublicHttpUrl('https://hooks.example.com/event#fragmento', resolver);
    expect(result.url.toString()).toBe('https://hooks.example.com/event');
    expect(result.addresses).toEqual(await resolver.mock.results[0]!.value);
    expect(resolver).toHaveBeenCalledOnce();
  });
});
