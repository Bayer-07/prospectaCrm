import { describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../auth/types.js';
import { PublicMessagesService } from './public-messages.service.js';

const auth: AuthContext = {
  type: 'apiKey', organizationId: 'organization-1', name: 'Integração',
  permissions: [{ resource: 'conversations', action: 'write', scope: 'ALL' }, { resource: 'contacts', action: 'write', scope: 'ALL' }],
};
const body = { phone: '+5545999990000', text: 'Olá!', instanceId: 'c72a3b7c-efda-42f7-b2b7-1c40374ec6f3' };

describe('API de mensagens: validação e opções', () => {
  it.each([
    { ...body, phone: 'sem telefone' },
    { ...body, phone: '+0000000000' },
    { ...body, phone: '45999990000@s.whatsapp.net' },
    { ...body, text: '   ' },
    { ...body, text: 'a'.repeat(10_001) },
    { ...body, instanceId: 'invalid' },
    { ...body, assigneeId: 'invalid' },
    { ...body, teamId: 'invalid' },
    { ...body, contactName: ' ' },
    { ...body, organizationId: 'other-organization' },
  ])('rejeita dados inválidos antes de consultar o banco: %j', async (input) => {
    const findUnique = vi.fn();
    const service = new PublicMessagesService({ idempotencyRecord: { findUnique } } as never, {} as never, {} as never, {} as never);
    await expect(service.send(auth, input, 'request-001')).rejects.toMatchObject({ status: 400 });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it.each([undefined, '', 'short', '        ', 'x'.repeat(161)])('exige chave de idempotência válida: %s', async (key) => {
    const service = new PublicMessagesService({} as never, {} as never, {} as never, {} as never);
    await expect(service.send(auth, body, key)).rejects.toMatchObject({ status: 400 });
  });

  it('exige permissão de escrita de contatos para o cadastro e atribuição', async () => {
    const service = new PublicMessagesService({} as never, {} as never, {} as never, {} as never);
    await expect(service.send({ ...auth, permissions: [auth.permissions[0]] }, body, 'request-001')).rejects.toMatchObject({ status: 403 });
  });

  it('lista somente opções da organização sem credenciais da conexão ou do usuário', async () => {
    const userFind = vi.fn().mockResolvedValue([{ id: 'user-1', name: 'Maria', teamMemberships: [{ teamId: 'team-1' }] }]);
    const teamFind = vi.fn().mockResolvedValue([]);
    const instanceFind = vi.fn().mockResolvedValue([]);
    const service = new PublicMessagesService({ user: { findMany: userFind }, team: { findMany: teamFind }, whatsappInstance: { findMany: instanceFind } } as never, {} as never, {} as never, {} as never);
    expect(await service.users(auth)).toEqual([{ id: 'user-1', name: 'Maria', teamIds: ['team-1'] }]);
    await service.teams(auth);
    await service.connections(auth);
    expect(userFind).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: auth.organizationId, status: 'ACTIVE' } }));
    expect(teamFind).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: auth.organizationId } }));
    expect(instanceFind).toHaveBeenCalledWith({
      where: { organizationId: auth.organizationId, archivedAt: null, status: 'CONNECTED' },
      select: { id: true, name: true, phone: true, status: true }, orderBy: { name: 'asc' },
    });
  });

  it('restringe opções à equipe da sessão', async () => {
    const userFind = vi.fn().mockResolvedValue([]);
    const teamFind = vi.fn().mockResolvedValue([]);
    const instanceFind = vi.fn().mockResolvedValue([]);
    const service = new PublicMessagesService({ user: { findMany: userFind }, team: { findMany: teamFind }, whatsappInstance: { findMany: instanceFind } } as never, {} as never, {} as never, {} as never);
    const teamAuth: AuthContext = { ...auth, type: 'session', userId: 'user-1', teamIds: ['team-1'], permissions: [{ resource: 'conversations', action: 'write', scope: 'TEAM' }] };
    await service.users(teamAuth);
    await service.teams(teamAuth);
    await service.connections(teamAuth);
    expect(userFind.mock.calls[0][0].where.teamMemberships).toEqual({ some: { teamId: { in: ['team-1'] } } });
    expect(teamFind.mock.calls[0][0].where.id).toEqual({ in: ['team-1'] });
    expect(instanceFind.mock.calls[0][0].where.teams).toEqual({ some: { teamId: { in: ['team-1'] } } });
  });
});
