import { describe, expect, it, vi } from 'vitest';
import { renderTaskDigest, saoPauloDayRange, TaskDigestProcessor } from './task-digest.processor.js';

const task = {
  id: 'task-1',
  organizationId: 'org-1',
  title: 'Retornar para o cliente',
  description: 'Confirmar a proposta',
  dueAt: new Date('2026-07-24T12:30:00.000Z'),
  priority: 'HIGH' as const,
  assigneeId: 'user-1',
  assignee: { id: 'user-1', name: 'Gabriel Bayer', email: 'gabriel@example.com' },
  organization: { name: 'BZS Tecnologia' },
  company: { name: 'Empresa Exemplo' },
  contact: null,
  opportunity: null,
};

describe('TaskDigestProcessor', () => {
  it('agrupa e envia as tarefas do dia ao responsável', async () => {
    const findMany = vi.fn().mockResolvedValue([task]);
    const findUnique = vi.fn().mockResolvedValue(null);
    const create = vi.fn().mockResolvedValue({ id: 'delivery-1' });
    const update = vi.fn().mockResolvedValue({});
    const sendTaskDigest = vi.fn().mockResolvedValue({ id: 'mailgun-id' });
    const processor = new TaskDigestProcessor({
      task: { findMany },
      taskDigestDelivery: { findUnique, create, update },
    } as never, { sendTaskDigest } as never);

    const result = await processor.process(new Date('2026-07-24T11:00:00.000Z'));

    expect(result).toMatchObject({ date: '2026-07-24', users: 1, sent: 1, tasks: 1 });
    expect(sendTaskDigest).toHaveBeenCalledWith(expect.objectContaining({
      to: 'gabriel@example.com',
      userId: 'user-1',
      digestDate: '2026-07-24',
    }));
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: 'delivery-1' },
      data: expect.objectContaining({ status: 'SENT', providerMessageId: 'mailgun-id' }),
    }));
  });

  it('não reenvia um resumo já confirmado', async () => {
    const sendTaskDigest = vi.fn();
    const processor = new TaskDigestProcessor({
      task: { findMany: vi.fn().mockResolvedValue([task]) },
      taskDigestDelivery: { findUnique: vi.fn().mockResolvedValue({ id: 'delivery-1', status: 'SENT' }) },
    } as never, { sendTaskDigest } as never);

    const result = await processor.process(new Date('2026-07-24T11:00:00.000Z'));

    expect(result).toMatchObject({ sent: 0, skipped: 1 });
    expect(sendTaskDigest).not.toHaveBeenCalled();
  });

  it('usa o dia de São Paulo e escapa conteúdo no HTML', () => {
    const range = saoPauloDayRange('2026-07-24');
    expect(range.start.toISOString()).toBe('2026-07-24T03:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-07-25T03:00:00.000Z');
    const result = renderTaskDigest(task.assignee, [{ ...task, title: '<script>alert(1)</script>' }], '2026-07-24');
    expect(result.html).toContain('&lt;script&gt;');
    expect(result.html).not.toContain('<script>alert');
    expect(result.html).toContain('BZS ONE');
    expect(result.html).toContain('data-email-preheader="true"');
    expect(result.html).toContain('Abrir minha agenda');
    expect(result.html).not.toContain('%unsubscribe_url%');
  });
});
