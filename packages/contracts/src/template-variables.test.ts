import { describe, expect, it } from 'vitest';
import { contactTemplateVariables, renderTemplateVariables, timeBasedGreeting } from './template-variables.js';

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
});
