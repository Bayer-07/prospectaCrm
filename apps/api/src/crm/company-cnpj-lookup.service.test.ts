import { BadRequestException, NotFoundException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompanyCnpjLookupService } from './company-cnpj-lookup.service.js';

const previousLookupApiUrl = process.env.CNPJ_LOOKUP_API_URL;

describe('CompanyCnpjLookupService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    if (previousLookupApiUrl === undefined) delete process.env.CNPJ_LOOKUP_API_URL;
    else process.env.CNPJ_LOOKUP_API_URL = previousLookupApiUrl;
  });

  it('normaliza o retorno público para os campos usados no cadastro da empresa', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        cnpj: '19131243000197',
        razao_social: 'OPEN KNOWLEDGE BRASIL',
        nome_fantasia: 'REDE PELO CONHECIMENTO LIVRE',
        cnae_fiscal_descricao: 'Atividades de associações',
        porte: 'DEMAIS',
        ddd_telefone_1: '(11) 2385-1939',
        descricao_situacao_cadastral: 'ATIVA',
        descricao_tipo_de_logradouro: 'AVENIDA',
        logradouro: 'PAULISTA',
        numero: '37',
        complemento: 'ANDAR 4',
        bairro: 'BELA VISTA',
        cep: '01311902',
        municipio: 'SAO PAULO',
        uf: 'SP',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const service = new CompanyCnpjLookupService();

    const result = await service.lookup('19.131.243/0001-97');

    expect(result).toMatchObject({
      cnpj: '19131243000197',
      name: 'REDE PELO CONHECIMENTO LIVRE',
      legalName: 'OPEN KNOWLEDGE BRASIL',
      phone: '+551123851939',
      size: 'Demais',
      registrationStatus: 'ATIVA',
      address: {
        formatted: 'AVENIDA PAULISTA, 37 · ANDAR 4 · BELA VISTA · SAO PAULO - SP · CEP 01311902',
        country: 'Brasil',
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://brasilapi.com.br/api/cnpj/v1/19131243000197',
      expect.objectContaining({
        headers: {
          Accept: 'application/json',
          'User-Agent': 'BZS-One/1.0 (+internal CRM)',
        },
      }),
    );
  });

  it('reutiliza a consulta em cache para o mesmo CNPJ', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        razao_social: 'GOOGLE BRASIL INTERNET LTDA.',
        nome_fantasia: 'GOOGLE BRASIL',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const service = new CompanyCnpjLookupService();

    await service.lookup('04.252.011/0001-10');
    await service.lookup('04252011000110');

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('não consulta um CNPJ com dígitos verificadores inválidos', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(new CompanyCnpjLookupService().lookup('04.252.011/0001-11')).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('informa quando o CNPJ não existe na base pública', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(new CompanyCnpjLookupService().lookup('04.252.011/0001-10')).rejects.toBeInstanceOf(NotFoundException);
  });
});
