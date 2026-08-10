import { afterEach, describe, expect, it, vi } from 'vitest';

const { dnsLookup } = vi.hoisted(() => ({
  dnsLookup: vi.fn().mockResolvedValue([{ address: '8.8.8.8', family: 4 }]),
}));
vi.mock('node:dns/promises', () => ({ lookup: dnsLookup }));

import { extractLinkPreviewMetadata, firstLinkInText, LinkPreviewService } from './link-preview.service.js';

describe('LinkPreviewService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    dnsLookup.mockReset();
    dnsLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
  });

  it('extrai metadados Open Graph e resolve a imagem relativa', () => {
    expect(extractLinkPreviewMetadata(`
      <html><head>
        <meta property="og:site_name" content="BZS Tecnologia">
        <meta property="og:title" content="Gestão inteligente &amp; integrada">
        <meta property="og:description" content="Sistemas em nuvem para empresas.">
        <meta property="og:image" content="/marca.png">
      </head></html>
    `, 'https://www.bzs.com.br/sistemas/')).toEqual({
      url: 'https://www.bzs.com.br/sistemas/',
      hostname: 'bzs.com.br',
      title: 'Gestão inteligente & integrada',
      description: 'Sistemas em nuvem para empresas.',
      imageUrl: 'https://www.bzs.com.br/marca.png',
      siteName: 'BZS Tecnologia',
    });
  });

  it('usa o ícone do site quando a página não declara uma imagem social', () => {
    expect(extractLinkPreviewMetadata(`
      <html><head>
        <title>Proposta da empresa</title>
        <link rel="icon" href="/marca.ico">
      </head></html>
    `, 'https://empresa.com.br/proposta')).toMatchObject({
      title: 'Proposta da empresa',
      imageUrl: 'https://empresa.com.br/marca.ico',
    });
  });

  it('busca a página pública e devolve a prévia completa', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(`
      <meta property="og:title" content="Proposta comercial">
      <meta property="og:description" content="Conheça a solução apresentada.">
      <meta property="og:image" content="https://cdn.empresa.com.br/proposta.jpg">
    `, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(new LinkPreviewService().lookup('https://empresa.com.br/proposta')).resolves.toMatchObject({
      hostname: 'empresa.com.br',
      title: 'Proposta comercial',
      description: 'Conheça a solução apresentada.',
      imageUrl: 'https://cdn.empresa.com.br/proposta.jpg',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('não acessa endereços privados e mantém um fallback clicável', async () => {
    dnsLookup.mockResolvedValue([{ address: '192.168.0.10', family: 4 }]);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(new LinkPreviewService().lookup('https://intranet.empresa.com.br/proposta')).resolves.toEqual({
      url: 'https://intranet.empresa.com.br/proposta',
      hostname: 'intranet.empresa.com.br',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejeita links locais antes da consulta DNS', async () => {
    await expect(new LinkPreviewService().lookup('http://localhost:3000/segredo')).resolves.toBeNull();
    expect(dnsLookup).not.toHaveBeenCalled();
  });
});

describe('firstLinkInText', () => {
  it('encontra o primeiro link e remove pontuação e marcadores do final', () => {
    expect(firstLinkInText('Veja *https://www.bzs.com.br/sistemas/controle-agua-gas* agora')).toBe(
      'https://www.bzs.com.br/sistemas/controle-agua-gas',
    );
  });

  it('normaliza endereços iniciados por www', () => {
    expect(firstLinkInText('Acesse www.bzs.com.br.')).toBe('https://www.bzs.com.br');
  });
});
