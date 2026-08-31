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

const queueGraph = {
  nodes: [
    { id: 'trigger', type: 'trigger', data: {} },
    { id: 'queue', type: 'assign_queue', data: { teamId: 'team-2' } },
    { id: 'end', type: 'handoff', data: {} },
  ],
  edges: [
    { source: 'trigger', target: 'queue' },
    { source: 'queue', target: 'end' },
  ],
};

const httpGraph = {
  nodes: [
    { id: 'trigger', type: 'trigger', data: {} },
    { id: 'http', type: 'http_request', data: {
      method: 'POST',
      url: 'https://api.exemplo.com/pessoa?telefone={{telefone}}',
      headers: '{"Content-Type":"application/json"}',
      body: '{"contato":"{{nome}}"}',
      variableName: 'resposta',
      timeoutSeconds: 15,
      responseRoutes: [{ id: 'adult', label: 'Maior de idade', path: 'body.idade', operator: 'greater_than', value: '17' }],
    } },
    { id: 'adult-end', type: 'end', data: {} },
    { id: 'fallback-end', type: 'end', data: {} },
  ],
  edges: [
    { source: 'trigger', target: 'http' },
    { source: 'http', sourceHandle: 'adult', target: 'adult-end' },
    { source: 'http', sourceHandle: 'default', target: 'fallback-end' },
  ],
};

const capturedAnswerHttpGraph = {
  nodes: [
    { id: 'trigger', type: 'trigger', data: {} },
    { id: 'ask-cnpj', type: 'question', data: { text: 'Qual é o CNPJ?', responseVariable: 'cnpj' } },
    { id: 'validate-cnpj', type: 'http_request', data: {
      method: 'GET',
      url: 'https://api.exemplo.com/cnpj/{{cnpj}}',
      headers: '{}',
      body: '',
      variableName: 'validacao',
      timeoutSeconds: 15,
      responseRoutes: [{ id: 'success', label: 'Sucesso', path: 'status', operator: 'equals', value: '200' }],
    } },
    { id: 'confirmation', type: 'question', data: { text: 'O CNPJ {{cnpj}} está ativo: {{validacao.ativo}}', responseVariable: 'confirmacao' } },
    { id: 'fallback-end', type: 'end', data: {} },
  ],
  edges: [
    { source: 'trigger', target: 'ask-cnpj' },
    { source: 'ask-cnpj', target: 'validate-cnpj' },
    { source: 'validate-cnpj', sourceHandle: 'success', target: 'confirmation' },
    { source: 'validate-cnpj', sourceHandle: 'default', target: 'fallback-end' },
    { source: 'confirmation', target: 'fallback-end' },
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
  it('transcreve o áudio antes de iniciar o atendimento por IA', async () => {
    const audio = {
      ...inboundMessage(),
      type: 'audio',
      text: null,
      transcriptionStatus: null,
      transcriptionText: null,
      transcriptionError: null,
    };
    const updateMessage = vi.fn().mockResolvedValue({});
    const chatbotQueue = { add: vi.fn().mockResolvedValue({}) };
    const transcriptionQueue = { add: vi.fn().mockResolvedValue({}) };
    const aiQueue = { add: vi.fn().mockResolvedValue({}) };
    const db = {
      message: { findUnique: vi.fn().mockResolvedValue(audio), update: updateMessage },
      chatbot: { findFirst: vi.fn().mockResolvedValue({ id: 'chatbot-1', publishedVersion: 1, responseProvider: 'OPENAI' }) },
      chatbotVersion: { findUnique: vi.fn().mockResolvedValue({ id: 'version-1', graph: aiGraph }) },
      chatbotSession: { upsert: vi.fn() },
    };
    const processor = new ChatbotProcessor(
      db as never,
      chatbotQueue as never,
      { add: vi.fn() } as never,
      aiQueue as never,
      transcriptionQueue as never,
    );

    await expect(processor.process({ data: { messageId: 'inbound-1' } } as never)).resolves.toBeUndefined();

    expect(updateMessage).toHaveBeenCalledWith({
      where: { id: 'inbound-1' },
      data: expect.objectContaining({ transcriptionStatus: 'PROCESSING', transcriptionText: null }),
    });
    expect(transcriptionQueue.add).toHaveBeenCalledWith(
      'transcribe-audio',
      { messageId: 'inbound-1' },
      expect.objectContaining({ jobId: 'transcription-inbound-1', attempts: 3 }),
    );
    expect(chatbotQueue.add).toHaveBeenCalledWith(
      'process-chatbot-message',
      { messageId: 'inbound-1', audioWaitCount: 1 },
      expect.objectContaining({ delay: 5_000 }),
    );
    expect(db.chatbotSession.upsert).not.toHaveBeenCalled();
    expect(aiQueue.add).not.toHaveBeenCalled();
  });

  it('usa a transcrição como mensagem atual ao acionar a IA', async () => {
    const transcribedAudio = {
      ...inboundMessage(),
      type: 'audio',
      text: null,
      transcriptionStatus: 'COMPLETED',
      transcriptionText: 'Preciso integrar o WhatsApp ao meu sistema.',
      transcriptionError: null,
    };
    const upsertSession = vi.fn().mockResolvedValue({ id: 'session-1', conversationId: 'conversation-1', currentNodeId: 'trigger' });
    const db = {
      message: { findUnique: vi.fn().mockResolvedValue(transcribedAudio) },
      chatbot: { findFirst: vi.fn().mockResolvedValue({ id: 'chatbot-1', publishedVersion: 1, responseProvider: 'OPENAI' }) },
      chatbotVersion: { findUnique: vi.fn().mockResolvedValue({ id: 'version-1', graph: aiGraph }) },
      chatbotSession: {
        upsert: upsertSession,
        update: vi.fn().mockResolvedValue({}),
        findUnique: vi.fn().mockResolvedValue({ context: {} }),
      },
      chatbotStepExecution: { upsert: vi.fn().mockResolvedValue({}) },
      conversation: { findUnique: vi.fn().mockResolvedValue({ organizationId: 'organization-1', assigneeId: null }) },
      conversationAiGeneration: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        upsert: vi.fn().mockResolvedValue({ id: 'generation-audio' }),
      },
      $transaction: vi.fn().mockResolvedValue([]),
    };
    const aiQueue = { add: vi.fn().mockResolvedValue({}) };
    const processor = new ChatbotProcessor(
      db as never,
      { add: vi.fn() } as never,
      { add: vi.fn() } as never,
      aiQueue as never,
      { add: vi.fn() } as never,
    );

    await processor.process({ data: { messageId: 'inbound-1' } } as never);

    expect(upsertSession).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        context: expect.objectContaining({ lastMessage: 'Preciso integrar o WhatsApp ao meu sistema.' }),
      }),
    }));
    expect(aiQueue.add).toHaveBeenCalledWith(
      'generate',
      { generationId: 'generation-audio' },
      expect.objectContaining({ priority: 1 }),
    );
  });

  it('não responde fora de ordem quando outra mensagem chega durante a transcrição', async () => {
    const audio = {
      ...inboundMessage(),
      type: 'audio',
      text: null,
      transcriptionStatus: 'COMPLETED',
      transcriptionText: 'Mensagem antiga já transcrita.',
      transcriptionError: null,
    };
    const findChatbot = vi.fn();
    const db = {
      message: {
        findUnique: vi.fn().mockResolvedValue(audio),
        findFirst: vi.fn().mockResolvedValue({ id: 'inbound-2' }),
      },
      chatbot: { findFirst: findChatbot },
    };
    const processor = new ChatbotProcessor(
      db as never,
      { add: vi.fn() } as never,
      { add: vi.fn() } as never,
      { add: vi.fn() } as never,
      { add: vi.fn() } as never,
    );

    await expect(processor.process({ data: { messageId: 'inbound-1', audioWaitCount: 1 } } as never)).resolves.toBeUndefined();

    expect(db.message.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { conversationId: 'conversation-1', direction: 'INBOUND' },
    }));
    expect(findChatbot).not.toHaveBeenCalled();
  });

  it('atribui a fila, remove atendente incompatível e continua para o próximo bloco', async () => {
    const updateConversation = vi.fn().mockResolvedValue({});
    const createEvent = vi.fn().mockResolvedValue({});
    const db = {
      message: { findUnique: vi.fn().mockResolvedValue(inboundMessage()) },
      chatbot: { findFirst: vi.fn().mockResolvedValue({ id: 'chatbot-1', publishedVersion: 1, responseProvider: 'RULES' }) },
      chatbotVersion: { findUnique: vi.fn().mockResolvedValue({ id: 'version-1', graph: queueGraph }) },
      chatbotSession: {
        upsert: vi.fn().mockResolvedValue({ id: 'session-1', conversationId: 'conversation-1', currentNodeId: 'trigger' }),
        update: vi.fn().mockResolvedValue({}),
      },
      chatbotStepExecution: { upsert: vi.fn().mockResolvedValue({}) },
      team: { findFirst: vi.fn().mockResolvedValue({ id: 'team-2', name: 'Gerência', organizationId: 'organization-1' }) },
      userTeam: { findUnique: vi.fn().mockResolvedValue(null) },
      conversation: {
        findUnique: vi.fn()
          .mockResolvedValueOnce({ id: 'conversation-1', organizationId: 'organization-1', teamId: 'team-1', assigneeId: 'user-1' })
          .mockResolvedValueOnce({ id: 'conversation-1', organizationId: 'organization-1', teamId: 'team-2', assigneeId: null, contact: { name: 'Maria' } }),
        update: updateConversation,
      },
      conversationEvent: { create: createEvent },
      user: { findMany: vi.fn().mockResolvedValue([{ id: 'user-2' }]) },
      notification: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };
    const processor = new ChatbotProcessor(db as never, { add: vi.fn() } as never, { add: vi.fn() } as never);

    await processor.process({ data: { messageId: 'inbound-1' } } as never);

    expect(updateConversation).toHaveBeenCalledWith({
      where: { id: 'conversation-1' },
      data: { teamId: 'team-2', assigneeId: null, status: 'WAITING' },
    });
    expect(createEvent).toHaveBeenCalledWith({ data: expect.objectContaining({
      type: 'chatbot_queue_assigned',
      metadata: { previousTeamId: 'team-1', teamId: 'team-2', removedAssigneeId: 'user-1' },
    }) });
    expect(db.chatbotSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { currentNodeId: 'end' },
    });
    expect(db.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      OR: [{ teamMemberships: { some: { teamId: 'team-2' } } }, { role: { key: 'admin' } }],
    }) }));
    expect(updateConversation).toHaveBeenCalledWith({
      where: { id: 'conversation-1' },
      data: { status: 'WAITING', assigneeId: null, closedAt: null },
    });
  });

  it('executa a requisição, guarda o body na sessão e segue pela rota correspondente', async () => {
    const updateSession = vi.fn().mockResolvedValue({});
    const upsertExecution = vi.fn().mockResolvedValue({});
    const db = {
      message: { findUnique: vi.fn().mockResolvedValue(inboundMessage()) },
      chatbot: { findFirst: vi.fn().mockResolvedValue({ id: 'chatbot-1', publishedVersion: 1, responseProvider: 'RULES' }) },
      chatbotVersion: { findUnique: vi.fn().mockResolvedValue({ id: 'version-1', graph: httpGraph }) },
      chatbotSession: {
        upsert: vi.fn().mockResolvedValue({ id: 'session-1', conversationId: 'conversation-1', currentNodeId: 'trigger' }),
        update: updateSession,
      },
      chatbotStepExecution: { findUnique: vi.fn().mockResolvedValue(null), upsert: upsertExecution },
      conversation: { update: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };
    const httpRequest = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      bodyText: '{"nome":"Gabriel","idade":19}',
      contentType: 'application/json',
    });
    const processor = new ChatbotProcessor(
      db as never,
      { add: vi.fn() } as never,
      { add: vi.fn() } as never,
      undefined,
      undefined,
      undefined,
      httpRequest,
    );

    await processor.process({ data: { messageId: 'inbound-1' } } as never);

    expect(httpRequest).toHaveBeenCalledWith(
      'https://api.exemplo.com/pessoa?telefone=+5545999999999',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"contato":"Maria"}',
        maxResponseBytes: 256 * 1024,
      }),
    );
    expect(updateSession).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: expect.objectContaining({
        currentNodeId: 'adult-end',
        context: expect.objectContaining({ variables: { resposta: { nome: 'Gabriel', idade: 19 } } }),
      }),
    });
    expect(upsertExecution).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ output: expect.objectContaining({ handle: 'adult', variableName: 'resposta' }) }),
    }));
  });

  it('salva a resposta da pergunta e reutiliza a variável no HTTP e em perguntas seguintes', async () => {
    const previousSession = {
      id: 'session-1', chatbotId: 'chatbot-1', versionId: 'version-1', status: 'WAITING',
      currentNodeId: 'ask-cnpj', lastInboundMessageId: 'inbound-old', wakeAt: null,
      context: { variables: { origem: 'chatbot' } },
    };
    const inbound = { ...inboundMessage(previousSession), text: '12345678000199' };
    const updateSession = vi.fn()
      .mockResolvedValueOnce({ id: 'session-1', conversationId: 'conversation-1', currentNodeId: 'validate-cnpj' })
      .mockResolvedValue({});
    const createMessage = vi.fn().mockResolvedValue({});
    const db = {
      message: { findUnique: vi.fn().mockResolvedValue(inbound), create: createMessage },
      chatbot: { findFirst: vi.fn().mockResolvedValue({ id: 'chatbot-1', publishedVersion: 1, responseProvider: 'RULES' }) },
      chatbotVersion: { findUnique: vi.fn().mockResolvedValue({ id: 'version-1', graph: capturedAnswerHttpGraph }) },
      chatbotSession: { update: updateSession },
      chatbotStepExecution: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({}) },
      conversation: { findUnique: vi.fn().mockResolvedValue({ instanceId: 'instance-1', assigneeId: null, status: 'WAITING' }) },
      $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };
    const httpRequest = vi.fn().mockResolvedValue({ ok: true, status: 200, bodyText: '{"ativo":true}' });
    const outboundQueue = { add: vi.fn().mockResolvedValue({}) };
    const processor = new ChatbotProcessor(
      db as never,
      { add: vi.fn() } as never,
      outboundQueue as never,
      undefined,
      undefined,
      undefined,
      httpRequest,
    );

    await processor.process({ data: { messageId: 'inbound-1' } } as never);

    expect(httpRequest).toHaveBeenCalledWith(
      'https://api.exemplo.com/cnpj/12345678000199',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(updateSession).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        context: expect.objectContaining({
          variables: expect.objectContaining({ origem: 'chatbot', cnpj: '12345678000199' }),
        }),
      }),
    }));
    expect(createMessage).toHaveBeenCalledWith({ data: expect.objectContaining({
      text: 'O CNPJ 12345678000199 está ativo: true',
    }) });
  });

  it('cancela uma geração anterior quando chega uma mensagem mais recente ao bloco de IA', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const db = {
      message: { findUnique: vi.fn().mockResolvedValue(inboundMessage()) },
      chatbot: { findFirst: vi.fn().mockResolvedValue({ id: 'chatbot-1', publishedVersion: 1, responseProvider: 'OPENAI' }) },
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

  it('limpa as variáveis temporárias ao iniciar um novo atendimento', async () => {
    const previousSession = {
      id: 'session-1', chatbotId: 'chatbot-1', versionId: 'version-1', status: 'COMPLETED',
      currentNodeId: 'end', lastInboundMessageId: 'inbound-old', wakeAt: null,
      context: { variables: { resposta: { nome: 'Atendimento anterior' } } },
    };
    const upsertSession = vi.fn().mockResolvedValue({ id: 'session-1', conversationId: 'conversation-1', currentNodeId: 'trigger' });
    const db = {
      message: { findUnique: vi.fn().mockResolvedValue(inboundMessage(previousSession)) },
      chatbot: { findFirst: vi.fn().mockResolvedValue({ id: 'chatbot-1', publishedVersion: 1, responseProvider: 'RULES' }) },
      chatbotVersion: { findUnique: vi.fn().mockResolvedValue({ id: 'version-1', graph }) },
      chatbotSession: { upsert: upsertSession, update: vi.fn().mockResolvedValue({}) },
      chatbotStepExecution: { upsert: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn().mockResolvedValue([]),
    };
    const processor = new ChatbotProcessor(db as never, { add: vi.fn().mockResolvedValue({}) } as never, { add: vi.fn() } as never);

    await processor.process({ data: { messageId: 'inbound-1' } } as never);

    expect(upsertSession).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ context: expect.objectContaining({ variables: {} }) }),
    }));
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
