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
    const generation = { id: 'generation-1', type: 'REPLY_SUGGESTION', status: 'PENDING' };
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
    expect(queue.add).toHaveBeenCalledWith('generate', { generationId: 'generation-1' }, expect.objectContaining({ jobId: 'ai-generation-1', priority: 2 }));
  });

  it('mantém a IA desligada quando o ambiente não foi habilitado', async () => {
    vi.stubEnv('AI_ASSISTANT_ENABLED', 'false');
    const service = new AiService({} as never, {} as never);
    await expect(service.createGeneration(admin, 'conversation-1', { type: 'SUMMARY' })).rejects.toThrow(/desativado/);
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
