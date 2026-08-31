import { describe, expect, it } from 'vitest';
import { contactTemplateVariables, renderTemplateVariables, renderUrlTemplateVariables, timeBasedGreeting } from './template-variables.js';

describe('variáveis de mensagem', () => {
  it.each([
    ['2026-08-10T07:59:00.000Z', 'Boa noite'],
    ['2026-08-10T08:00:00.000Z', 'Bom dia'],
    ['2026-08-10T14:59:00.000Z', 'Bom dia'],
    ['2026-08-10T15:00:00.000Z', 'Boa tarde'],
    ['2026-08-10T20:59:00.000Z', 'Boa tarde'],
    ['2026-08-10T21:00:00.000Z', 'Boa noite'],
  ])('resolve a saudação em São Paulo para %s', (isoDate, expected) => {
    expect(timeBasedGreeting(new Date(isoDate))).toBe(expected);
  });

  it('monta todas as variáveis conhecidas do contato', () => {
    expect(contactTemplateVariables({
      name: 'Adriana',
      phone: '+5545999999999',
      email: 'adriana@bzs.com.br',
      jobTitle: 'Síndica',
      companies: [{ company: { name: 'BZS Tecnologia' } }],
    }, new Date('2026-08-10T15:00:00.000Z'))).toEqual({
      nome: 'Adriana',
      telefone: '+5545999999999',
      email: 'adriana@bzs.com.br',
      empresa: 'BZS Tecnologia',
      cargo: 'Síndica',
      saudacao: 'Boa tarde',
    });
  });

  it('substitui variáveis sem diferenciar maiúsculas e força a saudação automática', () => {
    expect(renderTemplateVariables(
      '{{SAUDACAO}}, {{nome}}!',
      { nome: 'Adriana', saudacao: 'valor manual' },
      new Date('2026-08-10T08:00:00.000Z'),
    )).toBe('Bom dia, Adriana!');
  });

  it('resolve campos aninhados e itens de uma resposta JSON', () => {
    expect(renderTemplateVariables(
      '{{RESPOSTA.nome}} tem {{resposta.idade}} anos e escolheu {{resposta.opcoes.0}}.',
      { resposta: { nome: 'Gabriel', idade: 19, opcoes: ['Plano A', 'Plano B'] } },
    )).toBe('Gabriel tem 19 anos e escolheu Plano A.');
  });

  it('serializa o objeto quando a variável raiz é usada', () => {
    expect(renderTemplateVariables('{{resposta}}', { resposta: { nome: 'Gabriel' } }))
      .toBe('{"nome":"Gabriel"}');
  });

  it('codifica variáveis usadas em URLs sem alterar o restante da URL', () => {
    expect(renderUrlTemplateVariables(
      'https://api.exemplo.com/cnpj/{{cnp}}?telefone={{telefone}}',
      { cnp: '12.345.678/0001-90', telefone: '+55 45 99999-9999' },
    )).toBe('https://api.exemplo.com/cnpj/12.345.678%2F0001-90?telefone=%2B55%2045%2099999-9999');
  });

  it('não transforma uma variável ausente em uma URL incompleta', () => {
    expect(() => renderUrlTemplateVariables('https://api.exemplo.com/cnpj/{{cnp}}', {}))
      .toThrow('A variável {{cnp}} não está disponível neste atendimento');
  });
});
