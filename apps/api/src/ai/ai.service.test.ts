import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../auth/types.js';
import { AiService } from './ai.service.js';

const admin: AuthContext = {
  type: 'session', organizationId: 'org-1', userId: 'user-1', roleKey: 'admin', name: 'Administrador',
  permissions: [{ resource: '*', action: '*', scope: 'ALL' }],
};

afterEach(() => vi.unstubAllEnvs());

describe('serviço de IA', () => {
  it('restringe a configuração global a administradores', async () => {
    const service = new AiService({} as never, {} as never);
    await expect(service.getSettings({ ...admin, roleKey: 'seller' })).rejects.toThrow(/administradores/);
  });

  it('deduplica a mesma sugestão pela conversa e mensagem de origem', async () => {
    vi.stubEnv('AI_ASSISTANT_ENABLED', 'true');
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    const generation = { id: 'generation-1', type: 'REPLY_SUGGESTION', status: 'PENDING', updatedAt: new Date('2026-08-18T12:00:00.000Z') };
    const db = {
      organizationAiSettings: { findUnique: vi.fn().mockResolvedValue({ enabled: true }) },
      conversation: { findFirst: vi.fn().mockResolvedValue({ id: 'conversation-1', assigneeId: 'user-1', status: 'OPEN', contactId: 'contact-1' }) },
      message: { findFirst: vi.fn().mockResolvedValueOnce({ id: 'message-1' }).mockResolvedValueOnce({ id: 'message-12' }) },
      conversationAiGeneration: { upsert: vi.fn().mockResolvedValue(generation) },
    };
    const queue = { add: vi.fn().mockResolvedValue({}) };
    const service = new AiService(db as never, queue as never);

    await expect(service.createGeneration(admin, 'conversation-1', { type: 'REPLY_SUGGESTION' })).resolves.toBe(generation);
    expect(db.conversationAiGeneration.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { deduplicationKey: expect.stringMatching(/^[a-f0-9]{64}$/) },
      create: expect.objectContaining({ sourceFirstMessageId: 'message-1', sourceLastMessageId: 'message-12', requestedById: 'user-1' }),
    }));
    expect(queue.add).toHaveBeenCalledWith('generate', { generationId: 'generation-1' }, expect.objectContaining({ jobId: 'ai-generation-1-1787054400000', priority: 2 }));
  });

  it('permite tentar novamente uma sugestão que falhou sem duplicar o registro', async () => {
    vi.stubEnv('AI_ASSISTANT_ENABLED', 'true');
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    const failed = {
      id: 'generation-1', type: 'REPLY_SUGGESTION', status: 'FAILED',
      updatedAt: new Date('2026-08-18T12:00:00.000Z'),
    };
    const pending = { ...failed, status: 'PENDING', updatedAt: new Date('2026-08-18T12:05:00.000Z') };
    const db = {
      organizationAiSettings: { findUnique: vi.fn().mockResolvedValue({ enabled: true }) },
      conversation: { findFirst: vi.fn().mockResolvedValue({ id: 'conversation-1', assigneeId: 'user-1', status: 'OPEN', contactId: 'contact-1' }) },
      message: { findFirst: vi.fn().mockResolvedValueOnce({ id: 'message-1' }).mockResolvedValueOnce({ id: 'message-12' }) },
      conversationAiGeneration: {
        upsert: vi.fn().mockResolvedValue(failed),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(pending),
      },
    };
    const queue = { add: vi.fn().mockResolvedValue({}) };
    const service = new AiService(db as never, queue as never);

    await expect(service.createGeneration(admin, 'conversation-1', { type: 'REPLY_SUGGESTION' })).resolves.toBe(pending);
    expect(db.conversationAiGeneration.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'generation-1', status: 'FAILED' },
      data: expect.objectContaining({ status: 'PENDING', error: null, progress: 0 }),
    }));
    expect(queue.add).toHaveBeenCalledWith('generate', { generationId: 'generation-1' }, expect.objectContaining({
      jobId: 'ai-generation-1-1787054700000', priority: 2,
    }));
  });

  it('mantém a IA desligada quando o ambiente não foi habilitado', async () => {
    vi.stubEnv('AI_ASSISTANT_ENABLED', 'false');
    const service = new AiService({} as never, {} as never);
    await expect(service.createGeneration(admin, 'conversation-1', { type: 'SUMMARY' })).rejects.toThrow(/desativado/);
  });

  it('não cria gerações sem uma chave da OpenAI', async () => {
    vi.stubEnv('AI_ASSISTANT_ENABLED', 'true');
    vi.stubEnv('OPENAI_API_KEY', '');
    const db = { organizationAiSettings: { findUnique: vi.fn().mockResolvedValue({ enabled: true, openAiApiKeyEncrypted: null }) } };
    const service = new AiService(db as never, {} as never);
    await expect(service.createGeneration(admin, 'conversation-1', { type: 'SUMMARY' })).rejects.toThrow(/chave da OpenAI/);
  });

  it('criptografa a chave da organização e nunca a devolve para o navegador', async () => {
    vi.stubEnv('AI_ASSISTANT_ENABLED', 'true');
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('SESSION_SECRET', 'segredo-de-teste-com-tamanho-suficiente');
    const apiKey = 'sk-proj-chave-exclusiva-da-organizacao-1234';
    const findUnique = vi.fn()
      .mockResolvedValueOnce({ openAiApiKeyEncrypted: null })
      .mockImplementation(async () => {
        const saved = db.organizationAiSettings.upsert.mock.calls[0]?.[0].create;
        return {
          enabled: true,
          globalInstructions: 'Responda em português.',
          fallbackMessage: 'Transferindo para a equipe.',
          model: 'gpt-5.6-terra',
          openAiApiKeyEncrypted: saved.openAiApiKeyEncrypted,
          openAiApiKeyLastFour: saved.openAiApiKeyLastFour,
        };
      });
    const db = { organizationAiSettings: { findUnique, upsert: vi.fn().mockResolvedValue({}) } };
    const service = new AiService(db as never, {} as never);

    const result = await service.updateSettings(admin, {
      enabled: true,
      globalInstructions: 'Responda em português.',
      fallbackMessage: 'Transferindo para a equipe.',
      model: 'gpt-5.6-terra',
      apiKey,
    });

    const create = db.organizationAiSettings.upsert.mock.calls[0][0].create;
    expect(create.openAiApiKeyEncrypted).toMatch(/^v1\./);
    expect(create.openAiApiKeyEncrypted).not.toContain(apiKey);
    expect(create.openAiApiKeyLastFour).toBe('1234');
    expect(result).toMatchObject({ model: 'gpt-5.6-terra', apiKeyConfigured: true, apiKeySource: 'organization', apiKeyLastFour: '1234' });
    expect(result).not.toHaveProperty('openAiApiKeyEncrypted');
  });

  it('rejeita um modelo que não esteja na lista curada', async () => {
    const service = new AiService({} as never, {} as never);
    await expect(service.updateSettings(admin, { model: 'modelo-inexistente' })).rejects.toThrow(/modelo da OpenAI válido/);
  });

  it('não permite consultar um teste administrativo de outra organização', async () => {
    const db = { conversationAiGeneration: { findFirst: vi.fn().mockResolvedValue(null) } };
    const service = new AiService(db as never, {} as never);
    await expect(service.getTest(admin, 'test-1')).rejects.toThrow(/não encontrado/);
    expect(db.conversationAiGeneration.findFirst).toHaveBeenCalledWith({
      where: { id: 'test-1', organizationId: 'org-1', type: 'CONFIG_TEST' },
    });
  });

  it('exige permissão de escrita em contatos para aplicar propostas', async () => {
    const service = new AiService({} as never, {} as never);
    await expect(service.updateProposal(
      { ...admin, permissions: [{ resource: 'conversations', action: 'write', scope: 'ALL' }] },
      'conversation-1', 'proposal-1', { action: 'apply', fields: ['name'] },
    )).rejects.toThrow(/alterar contatos/);
  });
});
