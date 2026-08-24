import { describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../auth/types.js';
import { TeamsService } from './teams.service.js';

const auth: AuthContext = {
  type: 'session', organizationId: 'organization-1', userId: 'admin-1', roleKey: 'admin', name: 'Administrador',
  permissions: [{ resource: '*', action: '*', scope: 'ALL' }],
};

describe('gestão de equipes e filas', () => {
  it('protege a equipe Geral contra exclusão', async () => {
    const db = { team: { findFirst: vi.fn().mockResolvedValue({ id: 'team-geral', name: 'Geral', color: '#64748b', isDefault: true }) } };
    const service = new TeamsService(db as never, {} as never, {} as never);
    await expect(service.remove(auth, 'team-geral')).rejects.toThrow('Geral não pode ser excluída');
  });

  it('bloqueia uma fila referenciada pela versão publicada atual', async () => {
    const db = {
      team: { findFirst: vi.fn().mockResolvedValue({ id: 'team-1', name: 'Gerência', color: '#123456', isDefault: false }) },
      workflow: { findMany: vi.fn().mockResolvedValue([{ name: 'Roteamento', publishedVersion: 2, versions: [{ version: 1, graph: { nodes: [] } }, { version: 2, graph: { nodes: [{ type: 'assign_queue', data: { teamId: 'team-1' } }] } }] }]) },
      chatbot: { findMany: vi.fn().mockResolvedValue([]) },
      conversation: { findMany: vi.fn().mockResolvedValue([]) },
      userTeam: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new TeamsService(db as never, {} as never, {} as never);
    await expect(service.remove(auth, 'team-1')).rejects.toThrow('Automação: Roteamento');
  });

  it('exclui a fila sem alterar diretamente atendente ou status dos tickets', async () => {
    const teamDelete = vi.fn().mockResolvedValue({});
    const db = {
      team: { findFirst: vi.fn().mockResolvedValue({ id: 'team-1', name: 'Suporte', color: '#123456', isDefault: false }), delete: teamDelete },
      workflow: { findMany: vi.fn().mockResolvedValue([]) },
      chatbot: { findMany: vi.fn().mockResolvedValue([]) },
      conversation: { findMany: vi.fn().mockResolvedValue([{ id: 'conversation-1' }]) },
      userTeam: { findMany: vi.fn().mockResolvedValue([]) },
      conversationEvent: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };
    const realtime = { notifyOrganization: vi.fn() };
    const service = new TeamsService(db as never, { invalidateUser: vi.fn() } as never, realtime as never);
    await expect(service.remove(auth, 'team-1')).resolves.toEqual({ id: 'team-1', deleted: true });
    expect(teamDelete).toHaveBeenCalledWith({ where: { id: 'team-1' } });
    expect(db.conversation).not.toHaveProperty('updateMany');
  });
});
