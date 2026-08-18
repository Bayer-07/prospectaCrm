import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiGenerationProcessor, splitTranscript, validateChatbotDecision, validateSuggestedReply, validateSummary } from './ai.processor.js';

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
      message: { findMany: vi.fn().mockResolvedValue([{ id: 'message-1', direction: 'INBOUND', type: 'audio', text: null, transcriptionText: null, createdAt: new Date(), media: [] }]) },
    };
    const aiQueue = { add: vi.fn().mockResolvedValue({}) };
    const transcriptionQueue = { add: vi.fn().mockResolvedValue({}) };
    const ollama = { model: 'test', generate: vi.fn() };
    const processor = new AiGenerationProcessor(db as never, aiQueue as never, {} as never, {} as never, transcriptionQueue as never, ollama as never);

    await expect(processor.process({ data: { generationId: 'generation-1' } } as never)).resolves.toMatchObject({ payload: { status: 'WAITING_INPUT' } });
    expect(transcriptionQueue.add).toHaveBeenCalledWith('transcribe-audio', { messageId: 'message-1' }, expect.objectContaining({ jobId: 'transcription-message-1' }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'generation-1' }, data: expect.objectContaining({ status: 'WAITING_INPUT' }) }));
    expect(aiQueue.add).toHaveBeenCalledWith('generate', { generationId: 'generation-1' }, expect.objectContaining({ delay: 5_000 }));
    expect(ollama.generate).not.toHaveBeenCalled();
  });

  it('descarta a resposta automática se um atendente assumir durante a geração', async () => {
    vi.stubEnv('AI_ASSISTANT_ENABLED', 'true');
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
          .mockResolvedValueOnce({ assigneeId: null, contact: { id: 'contact-1', name: 'Maria', email: null, jobTitle: null, companies: [] }, chatbotSession: { id: 'session-1', context: {} } })
          .mockResolvedValueOnce({ assigneeId: 'human-1' }),
      },
      organizationAiSettings: { findUnique: vi.fn().mockResolvedValue({ enabled: true, globalInstructions: '', fallbackMessage: 'Transferindo.' }) },
      message: { findMany: vi.fn().mockResolvedValue([{ id: 'message-1', direction: 'INBOUND', type: 'text', text: 'Quero ajuda', transcriptionText: null, createdAt: new Date(), media: [] }]) },
    };
    const outboundQueue = { add: vi.fn() };
    const ollama = { model: 'test', generate: vi.fn().mockResolvedValue({ data: { reply: 'Claro!', action: 'continue', confidence: 0.9, proposal: {} }, model: 'test', metrics: {} }) };
    const processor = new AiGenerationProcessor(db as never, {} as never, outboundQueue as never, {} as never, {} as never, ollama as never);

    await processor.process({ data: { generationId: 'generation-2' } } as never);

    expect(update).toHaveBeenCalledWith({ where: { id: 'generation-2' }, data: expect.objectContaining({ status: 'CANCELLED' }) });
    expect(outboundQueue.add).not.toHaveBeenCalled();
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
