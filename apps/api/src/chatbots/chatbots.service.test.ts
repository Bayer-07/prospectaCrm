import { describe, expect, it } from 'vitest';
import { ChatbotsService } from './chatbots.service.js';

const service = new ChatbotsService({} as never);

describe('validação do mapa do chatbot', () => {
  it('aceita um fluxo completo com pergunta e condição', () => {
    expect(() => service.validateShape({
      nodes: [
        { id: 'start', type: 'trigger' },
        { id: 'question', type: 'question', data: { text: 'Como posso ajudar?' } },
        { id: 'condition', type: 'condition', data: { operator: 'equals', value: '1' } },
        { id: 'handoff', type: 'handoff' },
        { id: 'end', type: 'end' },
      ],
      edges: [
        { source: 'start', target: 'question' },
        { source: 'question', target: 'condition' },
        { source: 'condition', sourceHandle: 'true', target: 'handoff' },
        { source: 'condition', sourceHandle: 'false', target: 'end' },
      ],
    }, true)).not.toThrow();
  });

  it('bloqueia condição sem os dois caminhos', () => {
    expect(() => service.validateShape({
      nodes: [{ id: 'start', type: 'trigger' }, { id: 'condition', type: 'condition', data: { value: 'sim' } }, { id: 'end', type: 'end' }],
      edges: [{ source: 'start', target: 'condition' }, { source: 'condition', sourceHandle: 'true', target: 'end' }],
    }, true)).toThrow(/saídas/);
  });

  it('permite repetir uma pergunta quando a resposta é inválida', () => {
    expect(() => service.validateShape({
      nodes: [
        { id: 'start', type: 'trigger' },
        { id: 'question', type: 'question', data: { text: 'Digite 1' } },
        { id: 'condition', type: 'condition', data: { value: '1' } },
        { id: 'end', type: 'end' },
      ],
      edges: [
        { source: 'start', target: 'question' },
        { source: 'question', target: 'condition' },
        { source: 'condition', sourceHandle: 'true', target: 'end' },
        { source: 'condition', sourceHandle: 'false', target: 'question' },
      ],
    }, true)).not.toThrow();
  });

  it('bloqueia ciclos que enviariam mensagens sem aguardar o contato', () => {
    expect(() => service.validateShape({
      nodes: [
        { id: 'start', type: 'trigger' },
        { id: 'message', type: 'message', data: { text: 'Oi' } },
        { id: 'condition', type: 'condition', data: { value: 'sim' } },
        { id: 'end', type: 'end' },
      ],
      edges: [
        { source: 'start', target: 'message' },
        { source: 'message', target: 'condition' },
        { source: 'condition', sourceHandle: 'true', target: 'message' },
        { source: 'condition', sourceHandle: 'false', target: 'end' },
      ],
    }, true)).toThrow(/bloco de pergunta/);
  });
});
