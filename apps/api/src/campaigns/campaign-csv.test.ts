import { describe, expect, it } from 'vitest';
import { parseCampaignCsv } from './campaign-csv.js';

describe('CSV de campanhas', () => {
  it('aceita CSV brasileiro, normaliza telefones e preserva mensagens múltiplas', () => {
    const preview = parseCampaignCsv([
      'Nome;Telefone;Mensagem 1;Mensagem 2',
      'Maria;(45) 99922-5389;Olá Maria;Tudo bem?',
    ].join('\n'));

    expect(preview).toMatchObject({ total: 1, valid: 1, invalid: 0 });
    expect(preview.rows[0]).toMatchObject({
      name: 'Maria',
      phone: '+5545999225389',
      messages: ['Olá Maria', 'Tudo bem?'],
    });
  });

  it('informa linhas sem telefone, sem mensagem ou duplicadas', () => {
    const preview = parseCampaignCsv([
      'telefone,mensagem',
      '45999225389,Primeira',
      '45999225389,Duplicada',
      ',Sem telefone',
      '45988112233,',
    ].join('\n'));

    expect(preview).toMatchObject({ total: 4, valid: 1, invalid: 3 });
    expect(preview.errors.map((item) => item.error)).toEqual([
      'Telefone duplicado no arquivo',
      'Telefone inválido',
      'Informe ao menos uma mensagem',
    ]);
  });

  it('detecta no CSV o mesmo celular com e sem o nono dígito', () => {
    const preview = parseCampaignCsv([
      'telefone,mensagem',
      '45999225389,Formato atual',
      '4599225389,Formato antigo',
    ].join('\n'));

    expect(preview).toMatchObject({ total: 2, valid: 1, invalid: 1 });
    expect(preview.errors[0]?.error).toBe('Telefone duplicado no arquivo');
  });

  it('exige as colunas de telefone e mensagem', () => {
    expect(() => parseCampaignCsv('nome,email\nMaria,maria@example.com')).toThrow(/telefone/);
    expect(() => parseCampaignCsv('nome,telefone\nMaria,45999225389')).toThrow(/mensagem/);
  });

  it('não impõe o antigo limite de 10 MB ao arquivo', () => {
    const longMessage = 'a'.repeat((10 * 1024 * 1024) + 1);
    const preview = parseCampaignCsv(`telefone,mensagem\n45999225389,"${longMessage}"`);

    expect(preview.valid).toBe(1);
    expect(preview.rows[0].messages[0]).toHaveLength(longMessage.length);
  });
});
