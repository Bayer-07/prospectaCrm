import { describe, expect, it } from 'vitest';
import { detectCsvDelimiter, parseCsvHeaders, suggestContactMapping } from './contact-import';

describe('importação de contatos por CSV', () => {
  it('identifica cabeçalhos separados por ponto e vírgula', () => {
    const csv = '\uFEFFnome;email;telefone;cargo\r\nMaria;maria@bzs.com.br;45999999999;Gestora';
    expect(detectCsvDelimiter(csv)).toBe(';');
    expect(parseCsvHeaders(csv)).toEqual(['nome', 'email', 'telefone', 'cargo']);
  });

  it('preserva separadores dentro de cabeçalhos entre aspas', () => {
    expect(parseCsvHeaders('"nome, completo",email,telefone\nMaria,maria@bzs.com.br,45999999999'))
      .toEqual(['nome, completo', 'email', 'telefone']);
  });

  it('sugere o mapeamento dos nomes de coluna mais comuns', () => {
    expect(suggestContactMapping(['Nome completo', 'E-mail', 'WhatsApp', 'Função', 'ID externo']))
      .toEqual({
        'Nome completo': 'name',
        'E-mail': 'email',
        WhatsApp: 'phone',
        Função: 'jobTitle',
        'ID externo': 'externalId',
      });
  });
});
