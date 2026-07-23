import { describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../auth/types.js';
import { ReportsService } from './reports.service.js';

const auth: AuthContext = {
  type: 'session',
  organizationId: 'organization-1',
  userId: 'user-1',
  name: 'Operador',
  permissions: [],
};

describe('resumo de relatórios', () => {
  it('monta os indicadores a partir de agregações no banco sem materializar registros', async () => {
    const opportunityGroupBy = vi.fn().mockResolvedValue([
      { stageId: 'stage-1', _count: { _all: 3 }, _sum: { valueCents: 150_000 } },
    ]);
    const opportunityAggregate = vi.fn()
      .mockResolvedValueOnce({ _count: { _all: 2 }, _sum: { valueCents: 100_000 } })
      .mockResolvedValueOnce({ _count: { _all: 1 }, _sum: { valueCents: 50_000 } });
    const service = new ReportsService({
      opportunity: {
        groupBy: opportunityGroupBy,
        aggregate: opportunityAggregate,
        count: vi.fn().mockResolvedValue(1),
      },
      pipelineStage: {
        findMany: vi.fn().mockResolvedValue([{ id: 'stage-1', name: 'Novo', color: '#fff' }]),
      },
      campaign: { count: vi.fn().mockResolvedValue(1) },
      campaignRecipient: {
        groupBy: vi.fn().mockResolvedValue([{ status: 'SENT', _count: { _all: 4 } }]),
      },
      conversation: {
        groupBy: vi.fn().mockResolvedValue([
          { status: 'OPEN', _count: { _all: 2 } },
          { status: 'CLOSED', _count: { _all: 3 } },
        ]),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ averageMs: 90_000 }]),
      activity: { groupBy: vi.fn().mockResolvedValue([{ userId: 'user-1', type: 'CALL', _count: 2 }]) },
      task: { groupBy: vi.fn().mockResolvedValue([{ status: 'OPEN', _count: 5 }]) },
    } as never);

    const result = await service.summary(auth, {
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-31T23:59:59.999Z',
    });

    expect(result.funnel).toEqual([{ id: 'stage-1', name: 'Novo', color: '#fff', count: 3, valueCents: 150_000 }]);
    expect(result.sales).toEqual({
      open: 2,
      openValueCents: 100_000,
      won: 1,
      wonValueCents: 50_000,
      lost: 1,
      conversionRate: 50,
    });
    expect(result.inbox).toEqual({ opened: 5, currentlyOpen: 2, averageFirstResponseMinutes: 2 });
    expect(result.campaigns).toEqual({ total: 1, recipients: { sent: 4 } });
    expect(result.activities).toEqual([{ userId: 'user-1', type: 'CALL', _count: 2 }]);
    expect(result.tasks).toEqual([{ status: 'OPEN', _count: 5 }]);
    expect(opportunityGroupBy).toHaveBeenCalledOnce();
    expect(opportunityAggregate).toHaveBeenCalledTimes(2);
  });
});
