import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import {
  AiGenerationProcessor,
  generateInPortuguese,
  isProbablyEnglishText,
  splitTranscript,
  validateChatbotDecision,
  validateSuggestedReply,
  validateSummary,
} from './ai.processor.js';

function encryptTestSecret(value: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(secret).digest(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}

afterEach(() => vi.unstubAllEnvs());

describe('processamento estruturado da IA', () => {
  it('divide conversas longas sem perder nem reordenar mensagens', () => {
    const lines = ['primeira mensagem', 'segunda mensagem', 'terceira mensagem'];
    expect(splitTranscript(lines, 35)).toEqual(['primeira mensagem\nsegunda mensagem', 'terceira mensagem']);
  });

  it('normaliza um resumo válido', () => {
    expect(validateSummary({
      overview: '  Conversa comercial ', need: ' Integração ', commitments: [' Retornar '], nextSteps: [], pending: [' Preço '],
    })).toEqual({ overview: 'Conversa comercial', need: 'Integração', commitments: ['Retornar'], nextSteps: [], pending: ['Preço'] });
  });

  it('distingue uma saída claramente inglesa de um resumo em português', () => {
    expect(isProbablyEnglishText('The customer requested information about the system and the next steps are pending.')).toBe(true);
    expect(isProbablyEnglishText('O cliente solicitou informações sobre o sistema e os próximos passos estão pendentes.')).toBe(false);
  });

  it('refaz em português uma geração inicialmente escrita em inglês', async () => {
    const generate = vi.fn()
      .mockResolvedValueOnce({ data: { reply: 'Hello, how can I help you with this system?' }, model: 'gpt-5.6-luna', metrics: {}, sources: [] })
      .mockResolvedValueOnce({ data: { reply: 'Olá, como posso ajudar com este sistema?' }, model: 'gpt-5.6-luna', metrics: {}, sources: [] });

    await expect(generateInPortuguese<{ reply: string }>({ generate } as never, {
      system: 'Responda ao cliente.', prompt: 'O cliente disse olá.', schema: { type: 'object' }, timeoutMs: 1_000,
    }, (data) => data.reply)).resolves.toMatchObject({ data: { reply: 'Olá, como posso ajudar com este sistema?' } });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate).toHaveBeenNthCalledWith(1, expect.objectContaining({ system: expect.stringContaining('exclusivamente em português do Brasil') }));
    expect(generate).toHaveBeenNthCalledWith(2, expect.objectContaining({ prompt: expect.stringContaining('foi escrita em inglês e foi rejeitada') }));
  });

  it('rejeita respostas incompletas ou confiança fora do intervalo', () => {
    expect(() => validateSuggestedReply({ reply: '' })).toThrow(/resposta sugerida/);
    expect(() => validateChatbotDecision({ reply: 'Olá', action: 'continue', confidence: 1.2, proposal: {} })).toThrow(/confiança/);
  });

  it('mantém somente propostas textuais declaradas pelo modelo', () => {
    expect(validateChatbotDecision({
      reply: 'Vou entender melhor.', action: 'continue', confidence: 0.82,
      proposal: { name: ' Maria ', email: null, companyName: ' BZS ', unknown: 'ignorar' },
    })).toEqual({ reply: 'Vou entender melhor.', action: 'continue', confidence: 0.82, proposal: { name: 'Maria', companyName: 'BZS' } });
  });

  it('aguarda e agenda a transcrição antes de resumir um áudio', async () => {
    vi.stubEnv('AI_ASSISTANT_ENABLED', 'true');
    const generation = {
      id: 'generation-1', organizationId: 'org-1', conversationId: 'conversation-1', chatbotSessionId: null,
      type: 'SUMMARY', status: 'PENDING', input: {}, sourceLastMessageId: 'message-1',
    };
    const update = vi.fn().mockResolvedValue({});
    const db = {
      conversationAiGeneration: {
        findUnique: vi.fn().mockResolvedValue(generation),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update,
      },
      conversation: { findUnique: vi.fn().mockResolvedValue({ assigneeId: 'user-1', contact: { id: 'contact-1', name: 'Maria', companies: [] }, chatbotSession: null }) },
      organizationAiSettings: { findUnique: vi.fn().mockResolvedValue({ enabled: true }) },
      aiKnowledgeDocument: { findFirst: vi.fn().mockResolvedValue(null) },
      message: { findMany: vi.fn().mockResolvedValue([{ id: 'message-1', direction: 'INBOUND', type: 'audio', text: null, transcriptionText: null, createdAt: new Date(), media: [] }]) },
    };
    const aiQueue = { add: vi.fn().mockResolvedValue({}) };
    const transcriptionQueue = { add: vi.fn().mockResolvedValue({}) };
    const ai = { model: 'test', generate: vi.fn() };
    const processor = new AiGenerationProcessor(db as never, aiQueue as never, {} as never, {} as never, transcriptionQueue as never, ai as never);

    await expect(processor.process({ data: { generationId: 'generation-1' } } as never)).resolves.toMatchObject({ payload: { status: 'WAITING_INPUT' } });
    expect(transcriptionQueue.add).toHaveBeenCalledWith('transcribe-audio', { messageId: 'message-1' }, expect.objectContaining({ jobId: 'transcription-message-1' }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'generation-1' }, data: expect.objectContaining({ status: 'WAITING_INPUT' }) }));
    expect(aiQueue.add).toHaveBeenCalledWith('generate', { generationId: 'generation-1' }, expect.objectContaining({ delay: 5_000 }));
    expect(ai.generate).not.toHaveBeenCalled();
  });

  it('gera e enfileira a resposta do chatbot a partir do áudio transcrito', async () => {
    vi.stubEnv('AI_ASSISTANT_ENABLED', 'true');
    const startedAt = new Date('2026-08-24T18:00:00.000Z');
    const audio = {
      id: 'audio-1', direction: 'INBOUND', type: 'audio', text: null,
      transcriptionStatus: 'COMPLETED',
      transcriptionText: 'Preciso integrar o WhatsApp ao meu sistema.',
      transcriptionError: null,
      createdAt: startedAt,
      media: [{ filename: 'audio.ogg', contentType: 'audio/ogg' }],
    };
    const generation = {
      id: 'generation-audio', organizationId: 'org-1', conversationId: 'conversation-1', chatbotSessionId: 'session-1',
      type: 'CHATBOT_REPLY', status: 'PENDING',
      input: { nodeId: 'ai-1', nextNodeId: 'handoff-1', turnCount: 1, maxInteractions: 6, minimumConfidence: 65 },
      sourceLastMessageId: 'audio-1',
    };
    const conversation = {
      id: 'conversation-1', organizationId: 'org-1', instanceId: 'instance-1', assigneeId: null, teamId: null,
      contact: { id: 'contact-1', name: 'Maria', phone: '+5545999999999', email: null, jobTitle: null, companies: [] },
      chatbotSession: { id: 'session-1', context: {}, startedAt },
    };
    const generationUpdate = vi.fn().mockResolvedValue({});
    const messageCreate = vi.fn().mockResolvedValue({});
    const db = {
      conversationAiGeneration: {
        findUnique: vi.fn().mockImplementation((query) => query.select ? { status: 'RUNNING' } : generation),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: generationUpdate,
      },
      conversation: {
        findUnique: vi.fn().mockImplementation((query) => query.include
          ? conversation
          : query.select?.contact
            ? conversation
            : { assigneeId: null }),
      },
      organizationAiSettings: { findUnique: vi.fn().mockResolvedValue({ enabled: true, globalInstructions: '', model: 'gpt-5.6-luna' }) },
      aiKnowledgeDocument: { findFirst: vi.fn().mockResolvedValue(null) },
      message: {
        findFirst: vi.fn().mockResolvedValue({ id: 'audio-1' }),
        findMany: vi.fn().mockResolvedValue([audio]),
        create: messageCreate,
      },
      chatbotSession: { update: vi.fn().mockResolvedValue({}) },
    };
    const outboundQueue = { add: vi.fn().mockResolvedValue({}) };
    const transcriptionQueue = { add: vi.fn().mockResolvedValue({}) };
    const ai = {
      generate: vi.fn().mockResolvedValue({
        data: { reply: 'Claro! Qual sistema você usa hoje?', action: 'continue', confidence: 0.92, proposal: null },
        model: 'gpt-5.6-luna', metrics: {}, sources: [],
      }),
    };
    const processor = new AiGenerationProcessor(
      db as never,
      { add: vi.fn() } as never,
      outboundQueue as never,
      { add: vi.fn() } as never,
      transcriptionQueue as never,
      ai as never,
    );

    await expect(processor.process({ data: { generationId: 'generation-audio' } } as never)).resolves.toMatchObject({
      payload: { status: 'COMPLETED' },
    });

    expect(ai.generate).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining('Cliente: Preciso integrar o WhatsApp ao meu sistema.'),
    }));
    expect(transcriptionQueue.add).not.toHaveBeenCalled();
    expect(messageCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
      direction: 'OUTBOUND',
      type: 'text',
      text: 'Claro! Qual sistema você usa hoje?',
    }) });
    expect(outboundQueue.add).toHaveBeenCalledWith(
      'send-message',
      expect.objectContaining({ messageId: expect.any(String) }),
      expect.objectContaining({ attempts: 5 }),
    );
    expect(generationUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'generation-audio' },
      data: expect.objectContaining({ status: 'COMPLETED' }),
    }));
  });

  it('descarta a resposta automática se um atendente assumir durante a geração', async () => {
    vi.stubEnv('AI_ASSISTANT_ENABLED', 'true');
    vi.stubEnv('ENCRYPTION_KEY', 'segredo-de-criptografia-do-teste');
    const sessionStartedAt = new Date('2026-08-18T14:00:01.000Z');
    const firstInbound = {
      id: 'message-initial', direction: 'INBOUND', type: 'text', text: 'Olá', transcriptionText: null,
      createdAt: new Date('2026-08-18T14:00:00.000Z'), media: [],
    };
    const currentInbound = {
      id: 'message-1', direction: 'INBOUND', type: 'text', text: 'Quero ajuda', transcriptionText: null,
      createdAt: new Date('2026-08-18T14:01:00.000Z'), media: [],
    };
    const generation = {
      id: 'generation-2', organizationId: 'org-1', conversationId: 'conversation-1', chatbotSessionId: 'session-1',
      type: 'CHATBOT_REPLY', status: 'PENDING', input: { nodeId: 'ai-1', turnCount: 1, maxInteractions: 6, minimumConfidence: 65 },
      sourceLastMessageId: 'message-1',
    };
    const update = vi.fn().mockResolvedValue({});
    const db = {
      conversationAiGeneration: {
        findUnique: vi.fn().mockResolvedValueOnce(generation).mockResolvedValueOnce({ status: 'CANCELLED' }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update,
      },
      conversation: {
        findUnique: vi.fn()
          .mockResolvedValueOnce({ assigneeId: null, contact: { id: 'contact-1', name: 'Maria', email: null, jobTitle: null, companies: [] }, chatbotSession: { id: 'session-1', context: {}, startedAt: sessionStartedAt } })
          .mockResolvedValueOnce({ assigneeId: 'human-1' }),
      },
      organizationAiSettings: { findUnique: vi.fn().mockResolvedValue({
        enabled: true,
        globalInstructions: '',
        fallbackMessage: 'Transferindo.',
        model: 'gpt-5.6-terra',
        openAiVectorStoreId: 'vs-1',
        openAiApiKeyEncrypted: encryptTestSecret('chave-da-organizacao', 'segredo-de-criptografia-do-teste'),
      }) },
      aiKnowledgeDocument: { findFirst: vi.fn().mockResolvedValue({ id: 'knowledge-1' }) },
      message: {
        findFirst: vi.fn().mockResolvedValue({ id: 'message-initial' }),
        findMany: vi.fn().mockResolvedValueOnce([currentInbound]).mockResolvedValueOnce([firstInbound]),
      },
    };
    const outboundQueue = { add: vi.fn() };
    const ai = { model: 'test', generate: vi.fn().mockResolvedValue({ data: { reply: 'Claro!', action: 'continue', confidence: 0.9, proposal: {} }, model: 'test', metrics: {}, sources: [{ fileId: 'file-1', filename: 'catalogo.pdf' }] }) };
    const processor = new AiGenerationProcessor(db as never, {} as never, outboundQueue as never, {} as never, {} as never, ai as never);

    await processor.process({ data: { generationId: 'generation-2' } } as never);

    expect(update).toHaveBeenCalledWith({ where: { id: 'generation-2' }, data: expect.objectContaining({ status: 'CANCELLED' }) });
    expect(outboundQueue.add).not.toHaveBeenCalled();
    expect(db.message.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { conversationId: 'conversation-1', createdAt: { gte: sessionStartedAt } },
      take: 12,
    }));
    expect(ai.generate).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining('Cliente: Olá'),
    }));
    expect(ai.generate).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining('Cliente: Quero ajuda'),
      model: 'gpt-5.6-terra',
      apiKey: 'chave-da-organizacao',
      vectorStoreId: 'vs-1',
    }));
  });

  it('reconcilia jobs perdidos e recupera uma geração abandonada pelo worker', async () => {
    const updatedAt = new Date('2026-08-17T12:00:00Z');
    const db = { conversationAiGeneration: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([{ id: 'generation-3', type: 'SUMMARY', updatedAt }]),
    } };
    const aiQueue = { add: vi.fn().mockResolvedValue({}) };
    const processor = new AiGenerationProcessor(db as never, aiQueue as never, {} as never, {} as never, {} as never, {} as never);

    await expect(processor.reconcilePending()).resolves.toEqual({ scheduled: 1 });
    expect(db.conversationAiGeneration.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'RUNNING' }), data: expect.objectContaining({ status: 'PENDING' }) }));
    expect(aiQueue.add).toHaveBeenCalledWith('generate', { generationId: 'generation-3' }, expect.objectContaining({ jobId: `ai-reconcile-generation-3-${updatedAt.getTime()}`, priority: 3 }));
  });
});
