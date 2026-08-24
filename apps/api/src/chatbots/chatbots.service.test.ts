import { describe, expect, it, vi } from 'vitest';
import { ChatbotsService } from './chatbots.service.js';

const service = new ChatbotsService({} as never);

describe('validação do mapa do chatbot', () => {
  it('aceita o pré-atendimento por IA quando a saída transfere para um humano', () => {
    expect(() => service.validateShape({
      nodes: [
        { id: 'start', type: 'trigger' },
        { id: 'ai', type: 'ai_conversation', data: { objective: 'Qualificar o contato', maxInteractions: 6, minimumConfidence: 65 } },
        { id: 'handoff', type: 'handoff' },
      ],
      edges: [{ source: 'start', target: 'ai' }, { source: 'ai', target: 'handoff' }],
    }, true)).not.toThrow();
  });

  it('aceita Atendimento por IA, Atribuir fila e Transferir em sequência', () => {
    expect(() => service.validateShape({
      nodes: [
        { id: 'start', type: 'trigger' },
        { id: 'ai', type: 'ai_conversation', data: { objective: 'Qualificar', maxInteractions: 6, minimumConfidence: 65 } },
        { id: 'queue', type: 'assign_queue', data: { teamId: 'team-1' } },
        { id: 'handoff', type: 'handoff' },
      ],
      edges: [{ source: 'start', target: 'ai' }, { source: 'ai', target: 'queue' }, { source: 'queue', target: 'handoff' }],
    }, true)).not.toThrow();
  });

  it('exige uma fila no novo bloco', () => {
    expect(() => service.validateShape({
      nodes: [{ id: 'start', type: 'trigger' }, { id: 'queue', type: 'assign_queue', data: {} }, { id: 'handoff', type: 'handoff' }],
      edges: [{ source: 'start', target: 'queue' }, { source: 'queue', target: 'handoff' }],
    }, true)).toThrow(/Selecione a fila/);
  });

  it('bloqueia um bloco de IA que não conduz diretamente à transferência', () => {
    expect(() => service.validateShape({
      nodes: [
        { id: 'start', type: 'trigger' },
        { id: 'ai', type: 'ai_conversation', data: { objective: 'Qualificar', maxInteractions: 6, minimumConfidence: 65 } },
        { id: 'end', type: 'end' },
      ],
      edges: [{ source: 'start', target: 'ai' }, { source: 'ai', target: 'end' }],
    }, true)).toThrow(/diretamente para Transferir/);
  });

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

  it('aceita uma espera em segundos e permite ciclos assíncronos por ela', () => {
    expect(() => service.validateShape({
      nodes: [
        { id: 'start', type: 'trigger' },
        { id: 'message', type: 'message', data: { text: 'Ainda estou por aqui' } },
        { id: 'wait', type: 'wait', data: { seconds: 30 } },
        { id: 'condition', type: 'condition', data: { value: 'continuar' } },
        { id: 'end', type: 'end' },
      ],
      edges: [
        { source: 'start', target: 'wait' },
        { source: 'wait', target: 'message' },
        { source: 'message', target: 'condition' },
        { source: 'condition', sourceHandle: 'true', target: 'wait' },
        { source: 'condition', sourceHandle: 'false', target: 'end' },
      ],
    }, true)).not.toThrow();
  });

  it('bloqueia uma espera com duração inválida', () => {
    expect(() => service.validateShape({
      nodes: [
        { id: 'start', type: 'trigger' },
        { id: 'wait', type: 'wait', data: { seconds: 0 } },
        { id: 'end', type: 'end' },
      ],
      edges: [{ source: 'start', target: 'wait' }, { source: 'wait', target: 'end' }],
    }, true)).toThrow(/tempo de espera válido/);
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

describe('exclusão de chatbot', () => {
  it('arquiva o chatbot, interrompe sessões ativas e preserva o histórico', async () => {
    const updateSessions = vi.fn().mockResolvedValue({ count: 2 });
    const updateChatbot = vi.fn().mockResolvedValue({ id: 'chatbot-1', status: 'ARCHIVED' });
    const audit = vi.fn().mockResolvedValue({});
    const db = {
      chatbot: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'chatbot-1', instanceId: 'instance-1', status: 'PUBLISHED', publishedVersion: 1, versions: [],
        }),
        update: updateChatbot,
      },
      chatbotSession: { updateMany: updateSessions },
      auditLog: { create: audit },
      $transaction: vi.fn().mockResolvedValue([]),
    };
    const chatbotService = new ChatbotsService(db as never);
    const auth = {
      type: 'session' as const,
      organizationId: 'organization-1',
      userId: 'user-1',
      name: 'Gabriel',
      permissions: [{ resource: '*', action: '*', scope: 'ALL' as const }],
    };

    await expect(chatbotService.remove(auth, 'chatbot-1')).resolves.toEqual({ id: 'chatbot-1', status: 'ARCHIVED' });
    expect(updateSessions).toHaveBeenCalledWith({
      where: { chatbotId: 'chatbot-1', status: { in: ['ACTIVE', 'WAITING'] } },
      data: { status: 'STOPPED', wakeAt: null, stopReason: 'Chatbot excluído', completedAt: expect.any(Date) },
    });
    expect(updateChatbot).toHaveBeenCalledWith({ where: { id: 'chatbot-1' }, data: { status: 'ARCHIVED' } });
    expect(audit).toHaveBeenCalledWith({ data: expect.objectContaining({
      action: 'chatbot.deleted', entityType: 'Chatbot', entityId: 'chatbot-1',
    }) });
  });
});
