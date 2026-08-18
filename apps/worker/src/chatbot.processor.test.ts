import { describe, expect, it, vi } from 'vitest';
import { ChatbotProcessor, chatbotWaitSeconds } from './chatbot.processor.js';

const graph = {
  nodes: [
    { id: 'trigger', type: 'trigger', data: {} },
    { id: 'wait', type: 'wait', data: { seconds: 5 } },
    { id: 'end', type: 'end', data: {} },
  ],
  edges: [
    { source: 'trigger', target: 'wait' },
    { source: 'wait', target: 'end' },
  ],
};

const aiGraph = {
  nodes: [
    { id: 'trigger', type: 'trigger', data: {} },
    { id: 'ai', type: 'ai_conversation', data: { objective: 'Entender a necessidade' } },
    { id: 'handoff', type: 'handoff', data: {} },
  ],
  edges: [
    { source: 'trigger', target: 'ai' },
    { source: 'ai', target: 'handoff' },
  ],
};

function inboundMessage(chatbotSession: Record<string, unknown> | null = null) {
  return {
    id: 'inbound-1',
    direction: 'INBOUND',
    text: 'Olá',
    conversation: {
      id: 'conversation-1',
      organizationId: 'organization-1',
      instanceId: 'instance-1',
      assigneeId: null,
      status: 'WAITING',
      contact: {
        id: 'contact-1',
        name: 'Maria',
        phone: '+5545999999999',
        email: null,
        jobTitle: null,
        consentStatus: 'GRANTED',
        companies: [],
      },
      chatbotSession,
    },
  };
}

describe('espera do chatbot', () => {
  it('cancela uma geração anterior quando chega uma mensagem mais recente ao bloco de IA', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const db = {
      message: { findUnique: vi.fn().mockResolvedValue(inboundMessage()) },
      chatbot: { findFirst: vi.fn().mockResolvedValue({ id: 'chatbot-1', publishedVersion: 1, responseProvider: 'OLLAMA' }) },
      chatbotVersion: { findUnique: vi.fn().mockResolvedValue({ id: 'version-1', graph: aiGraph }) },
      chatbotSession: {
        upsert: vi.fn().mockResolvedValue({ id: 'session-1', conversationId: 'conversation-1', currentNodeId: 'trigger' }),
        update: vi.fn().mockResolvedValue({}),
        findUnique: vi.fn().mockResolvedValue({ context: {} }),
      },
      chatbotStepExecution: { upsert: vi.fn().mockResolvedValue({}) },
      conversation: { findUnique: vi.fn().mockResolvedValue({ organizationId: 'organization-1', assigneeId: null }) },
      conversationAiGeneration: {
        updateMany,
        upsert: vi.fn().mockResolvedValue({ id: 'generation-new' }),
      },
      $transaction: vi.fn().mockResolvedValue([]),
    };
    const aiQueue = { add: vi.fn().mockResolvedValue({}) };
    const processor = new ChatbotProcessor(db as never, { add: vi.fn() } as never, { add: vi.fn() } as never, aiQueue as never);

    await processor.process({ data: { messageId: 'inbound-1' } } as never);

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        conversationId: 'conversation-1', type: 'CHATBOT_REPLY',
        status: { in: ['PENDING', 'WAITING_INPUT', 'RUNNING'] },
        deduplicationKey: { not: 'chatbot:session-1:ai:inbound-1' },
      },
      data: expect.objectContaining({ status: 'CANCELLED', completedAt: expect.any(Date) }),
    });
    expect(aiQueue.add).toHaveBeenCalledWith(
      'generate', { generationId: 'generation-new' }, expect.objectContaining({ jobId: 'ai-generation-new', priority: 1 }),
    );
  });

  it('persiste a pausa e agenda a retomada sem bloquear o worker', async () => {
    const db = {
      message: { findUnique: vi.fn().mockResolvedValue(inboundMessage()) },
      chatbot: { findFirst: vi.fn().mockResolvedValue({ id: 'chatbot-1', publishedVersion: 1, responseProvider: 'RULES' }) },
      chatbotVersion: { findUnique: vi.fn().mockResolvedValue({ id: 'version-1', graph }) },
      chatbotSession: {
        upsert: vi.fn().mockResolvedValue({ id: 'session-1', conversationId: 'conversation-1', currentNodeId: 'trigger' }),
        update: vi.fn().mockResolvedValue({}),
      },
      chatbotStepExecution: { upsert: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn().mockResolvedValue([]),
    };
    const chatbotQueue = { add: vi.fn().mockResolvedValue({}) };
    const processor = new ChatbotProcessor(db as never, chatbotQueue as never, { add: vi.fn() } as never);

    await expect(processor.process({ data: { messageId: 'inbound-1' } } as never)).resolves.toMatchObject({
      organizationId: 'organization-1',
    });
    expect(db.chatbotSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: expect.objectContaining({ status: 'WAITING', currentNodeId: 'wait', wakeAt: expect.any(Date) }),
    });
    expect(chatbotQueue.add).toHaveBeenCalledWith(
      'resume-chatbot-delay',
      expect.objectContaining({ sessionId: 'session-1', nodeId: 'wait', inboundMessageId: 'inbound-1' }),
      expect.objectContaining({ delay: expect.any(Number), attempts: 5 }),
    );
  });

  it('retoma exatamente do próximo bloco e conclui a execução da espera', async () => {
    const wakeAt = new Date(Date.now() - 1_000);
    const db = {
      chatbotSession: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'session-1',
          status: 'WAITING',
          currentNodeId: 'wait',
          lastInboundMessageId: 'inbound-1',
          wakeAt,
          context: { lastMessage: 'Olá', contactName: 'Maria', conversationId: 'conversation-1' },
          chatbot: { status: 'PUBLISHED', responseProvider: 'RULES' },
          version: { graph },
          conversation: { id: 'conversation-1', organizationId: 'organization-1', contactId: 'contact-1', assigneeId: null, status: 'WAITING' },
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({}),
      },
      chatbotStepExecution: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        upsert: vi.fn().mockResolvedValue({}),
      },
      conversation: { update: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn().mockResolvedValue([]),
    };
    const processor = new ChatbotProcessor(db as never, { add: vi.fn() } as never, { add: vi.fn() } as never);

    await expect(processor.process({ data: {
      sessionId: 'session-1',
      nodeId: 'wait',
      inboundMessageId: 'inbound-1',
      wakeAt: wakeAt.toISOString(),
    } } as never)).resolves.toMatchObject({ organizationId: 'organization-1' });
    expect(db.chatbotSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: 'ACTIVE', currentNodeId: 'end', wakeAt: null },
    }));
    expect(db.chatbotStepExecution.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'completed', completedAt: expect.any(Date) }),
    }));
  });

  it('ignora mensagens recebidas enquanto a pausa ainda está ativa', async () => {
    const delayed = { id: 'session-1', chatbotId: 'chatbot-1', versionId: 'version-1', status: 'WAITING', currentNodeId: 'wait', lastInboundMessageId: 'inbound-old', wakeAt: new Date(Date.now() + 60_000), context: {} };
    const db = {
      message: { findUnique: vi.fn().mockResolvedValue(inboundMessage(delayed)) },
      chatbot: { findFirst: vi.fn().mockResolvedValue({ id: 'chatbot-1', publishedVersion: 1, responseProvider: 'RULES' }) },
      chatbotVersion: { findUnique: vi.fn().mockResolvedValue({ id: 'version-1', graph }) },
      chatbotSession: { update: vi.fn(), upsert: vi.fn() },
    };
    const chatbotQueue = { add: vi.fn() };
    const processor = new ChatbotProcessor(db as never, chatbotQueue as never, { add: vi.fn() } as never);

    await expect(processor.process({ data: { messageId: 'inbound-1' } } as never)).resolves.toBeUndefined();
    expect(db.chatbotSession.update).not.toHaveBeenCalled();
    expect(chatbotQueue.add).not.toHaveBeenCalled();
  });

  it('reconcilia esperas persistidas sem criar polling por sessão', async () => {
    const wakeAt = new Date(Date.now() + 10_000);
    const db = { chatbotSession: { findMany: vi.fn().mockResolvedValue([{ id: 'session-1', currentNodeId: 'wait', lastInboundMessageId: 'inbound-1', wakeAt }]) } };
    const chatbotQueue = { add: vi.fn().mockResolvedValue({}) };
    const processor = new ChatbotProcessor(db as never, chatbotQueue as never, { add: vi.fn() } as never);

    await expect(processor.reconcileDelays()).resolves.toEqual({ scheduled: 1 });
    expect(chatbotQueue.add).toHaveBeenCalledTimes(1);
  });

  it('normaliza durações inválidas e limita a espera máxima', () => {
    expect(chatbotWaitSeconds({ seconds: 0 })).toBe(1);
    expect(chatbotWaitSeconds({ seconds: 2.9 })).toBe(2);
    expect(chatbotWaitSeconds({ seconds: Number.POSITIVE_INFINITY })).toBe(1);
    expect(chatbotWaitSeconds({ seconds: 99_999_999 })).toBe(31_536_000);
  });
});
