import { describe, expect, it } from 'vitest';
import { normalizeRuleText, RulesResponseProvider } from './chatbot-response-provider.js';

const provider = new RulesResponseProvider();
const context = { lastMessage: 'Olá, quero falar com VENDAS', contactName: 'Maria', contactPhone: '+5511999999999', conversationId: 'conversation' };

describe('provedor de respostas por regras', () => {
  it('normaliza caixa e acentos', () => expect(normalizeRuleText('  Olá  ')).toBe('ola'));
  it('aceita uma das palavras configuradas', () => expect(provider.matches({ operator: 'contains', value: 'suporte, vendas' }, context)).toBe(true));
  it('diferencia igualdade de conteúdo parcial', () => expect(provider.matches({ operator: 'equals', value: 'vendas' }, context)).toBe(false));
  it('interpola variáveis sem depender do motor de regras', () => expect(provider.interpolate('Oi {{nome}} — {{telefone}}', context)).toBe('Oi Maria — +5511999999999'));
});
