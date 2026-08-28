import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ActivityOrigin } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../auth/types.js';
import { ActivitiesService } from './activities.service.js';

const ids = {
  organization: '11111111-1111-4111-8111-111111111111',
  team: '22222222-2222-4222-8222-222222222222',
  user: '33333333-3333-4333-8333-333333333333',
  company: '44444444-4444-4444-8444-444444444444',
  activity: '55555555-5555-4555-8555-555555555555',
};

function auth(scope: 'OWN' | 'TEAM' | 'ALL' = 'ALL'): AuthContext {
  return {
    type: 'session', organizationId: ids.organization, userId: ids.user, teamId: ids.team, teamIds: [ids.team], roleKey: 'admin', name: 'Gabriel',
    permissions: [
      { resource: 'activities', action: 'read', scope }, { resource: 'activities', action: 'write', scope },
      { resource: 'companies', action: 'read', scope: 'ALL' }, { resource: 'contacts', action: 'read', scope: 'ALL' },
      { resource: 'opportunities', action: 'read', scope: 'ALL' },
    ],
  };
}

describe('ActivitiesService', () => {
  it('aplica organização, exclusão lógica e escopo da equipe na listagem', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new ActivitiesService({ activity: { findMany } } as never, { notifyOrganization: vi.fn() } as never);
    await service.list(auth('TEAM'), { limit: 30 });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: ids.organization, deletedAt: null }),
    }));
    expect(JSON.stringify(findMany.mock.calls[0][0].where)).toContain(ids.team);
  });

  it('registra uma ligação manual e publica atualização após a transação', async () => {
    const occurredAt = new Date('2026-08-28T12:00:00.000Z');
    const created = {
      id: ids.activity, organizationId: ids.organization, teamId: ids.team, userId: ids.user,
      companyId: ids.company, contactId: null, opportunityId: null, category: 'CALL', origin: 'MANUAL',
      status: 'COMPLETED', direction: 'OUTBOUND', type: 'call.logged', title: 'Ligação comercial', body: 'Falamos da proposta',
      outcome: 'connected', durationSeconds: 180, occurredAt, details: {}, sourceType: null,
    };
    const tx = { activity: { create: vi.fn().mockResolvedValue(created) }, task: { create: vi.fn() }, auditLog: { create: vi.fn().mockResolvedValue({}) } };
    const db = {
      company: { findFirst: vi.fn().mockResolvedValue({ id: ids.company, teamId: ids.team }) },
      contact: { findFirst: vi.fn() }, opportunity: { findFirst: vi.fn() },
      activity: { findFirst: vi.fn().mockResolvedValue({ ...created, user: { id: ids.user, name: 'Gabriel' } }) },
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const realtime = { notifyOrganization: vi.fn() };
    const service = new ActivitiesService(db as never, realtime as never);
    const result = await service.create(auth(), {
      category: 'call', title: 'Ligação comercial', body: 'Falamos da proposta', outcome: 'connected', durationSeconds: 180,
      occurredAt: occurredAt.toISOString(), companyId: ids.company,
    });
    expect(result.id).toBe(ids.activity);
    expect(tx.activity.create).toHaveBeenCalledWith({ data: expect.objectContaining({ organizationId: ids.organization, category: 'CALL', origin: 'MANUAL', outcome: 'connected' }) });
    expect(realtime.notifyOrganization).toHaveBeenCalledWith(ids.organization, 'activities.updated', { activityId: ids.activity });
  });

  it('não permite editar nem excluir uma atividade automática', async () => {
    const db = { activity: { findFirst: vi.fn().mockResolvedValue({ id: ids.activity, origin: ActivityOrigin.INBOX, sourceType: 'WHATSAPP_MESSAGE' }) } };
    const service = new ActivitiesService(db as never, { notifyOrganization: vi.fn() } as never);
    await expect(service.remove(auth(), ids.activity)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('não revela uma atividade fora do escopo', async () => {
    const db = { activity: { findFirst: vi.fn().mockResolvedValue(null) } };
    const service = new ActivitiesService(db as never, { notifyOrganization: vi.fn() } as never);
    await expect(service.get(auth('OWN'), ids.activity)).rejects.toBeInstanceOf(NotFoundException);
  });
});
