import { BadRequestException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { dnsLookup } = vi.hoisted(() => ({
  dnsLookup: vi.fn().mockResolvedValue([{ address: '8.8.8.8', family: 4 }]),
}));
vi.mock('node:dns/promises', () => ({ lookup: dnsLookup }));

import {
  CompanyLogoLookupService,
  extractCompanyLogoCandidates,
  normalizeCompanyDomain,
} from './company-logo-lookup.service.js';

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);

describe('CompanyLogoLookupService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    dnsLookup.mockReset();
    dnsLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
  });

  it('prioriza a logo estruturada do site sobre o favicon', () => {
    const candidates = extractCompanyLogoCandidates(`
      <html><head>
        <link rel="icon" sizes="32x32" href="/favicon.png">
        <script type="application/ld+json">{"@type":"Organization","logo":{"url":"/marca.png"}}</script>
      </head></html>
    `, 'https://empresa.com.br/');

    expect(candidates[0]).toEqual({ score: 1_000, url: 'https://empresa.com.br/marca.png' });
  });

  it('descobre e devolve uma imagem pronta para o fluxo privado de upload', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(
        '<script type="application/ld+json">{"@type":"Organization","logo":"/logo.png"}</script>',
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      ))
      .mockResolvedValueOnce(new Response(png, { status: 200, headers: { 'Content-Type': 'image/png' } }));
    vi.stubGlobal('fetch', fetchMock);
    const service = new CompanyLogoLookupService();

    const result = await service.lookup('https://www.empresa.com.br/sobre');

    expect(result).toMatchObject({
      domain: 'www.empresa.com.br',
      contentType: 'image/png',
      filename: 'logo-www.empresa.com.br.png',
      sourceUrl: 'https://www.empresa.com.br/logo.png',
    });
    expect(result?.dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('bloqueia domínios locais antes de fazer requisições', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(() => normalizeCompanyDomain('localhost:3000')).toThrow(BadRequestException);
    await expect(new CompanyLogoLookupService().lookup('127.0.0.1')).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
