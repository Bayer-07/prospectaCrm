import { timeBasedGreeting } from '@prospecta/contracts';
import { describe, expect, it } from 'vitest';
import { normalizeRuleText, RulesResponseProvider } from './chatbot-response-provider.js';

const provider = new RulesResponseProvider();
const context = {
  lastMessage: 'Olá, quero falar com VENDAS',
  contactName: 'Maria',
  contactPhone: '+5511999999999',
  contactEmail: 'maria@bzs.com.br',
  contactJobTitle: 'Síndica',
  contactCompany: 'BZS Tecnologia',
  conversationId: 'conversation',
};

describe('provedor de respostas por regras', () => {
  it('normaliza caixa e acentos', () => expect(normalizeRuleText('  Olá  ')).toBe('ola'));
  it('aceita uma das palavras configuradas', () => expect(provider.matches({ operator: 'contains', value: 'suporte, vendas' }, context)).toBe(true));
  it('diferencia igualdade de conteúdo parcial', () => expect(provider.matches({ operator: 'equals', value: 'vendas' }, context)).toBe(false));
  it('interpola todas as variáveis sem depender do motor de regras', () => {
    expect(provider.interpolate('{{saudacao}}, {{nome}} — {{telefone}} — {{email}} — {{empresa}} — {{cargo}} — {{mensagem}}', context))
      .toBe(`${timeBasedGreeting()}, Maria — +5511999999999 — maria@bzs.com.br — BZS Tecnologia — Síndica — Olá, quero falar com VENDAS`);
  });
  it('interpola um campo aninhado salvo durante o atendimento', () => {
    expect(provider.interpolate('{{resposta.nome}}', { ...context, variables: { resposta: { nome: 'Gabriel', idade: 19 } } }))
      .toBe('Gabriel');
  });
});
