import { describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../auth/types.js';
import { CampaignsService } from './campaigns.service.js';

const auth: AuthContext = {
  type: 'session',
  organizationId: 'organization-1',
  userId: 'user-1',
  roleKey: 'admin',
  name: 'Gabriel',
  permissions: [{ resource: '*', action: '*', scope: 'ALL' }],
};

describe('pré-validação de campanhas', () => {
  it('exclui logicamente a campanha e cancela destinatários pendentes', async () => {
    const campaignUpdate = vi.fn().mockResolvedValue({});
    const recipientUpdateMany = vi.fn().mockResolvedValue({ count: 2 });
    const auditCreate = vi.fn().mockResolvedValue({});
    const transaction = vi.fn().mockResolvedValue([]);
    const service = new CampaignsService({
      campaign: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'campaign-1',
          name: 'Campanha antiga',
          channel: 'EMAIL',
          status: 'RUNNING',
        }),
        update: campaignUpdate,
      },
      campaignRecipient: { updateMany: recipientUpdateMany },
      auditLog: { create: auditCreate },
      $transaction: transaction,
    } as never, {} as never, {} as never);

    const result = await service.archive(auth, 'campaign-1');

    expect(campaignUpdate).toHaveBeenCalledWith({
      where: { id: 'campaign-1' },
      data: { archivedAt: expect.any(Date), status: 'CANCELLED' },
    });
    expect(recipientUpdateMany).toHaveBeenCalledWith({
      where: { campaignId: 'campaign-1', status: { in: ['PENDING', 'QUEUED'] } },
      data: { status: 'SKIPPED', exclusionReason: 'Campanha excluída' },
    });
    expect(transaction).toHaveBeenCalledOnce();
    expect(auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
      action: 'campaign.archived',
      entityId: 'campaign-1',
    }) });
    expect(result).toEqual({ id: 'campaign-1', archivedAt: expect.any(Date) });
  });

  it('seleciona no servidor todos os contatos que correspondem à busca', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: 'contact-1' },
      { id: 'contact-2' },
    ]);
    const service = new CampaignsService({
      contact: { findMany },
    } as never, {} as never, {} as never);

    const result = await (service as unknown as {
      prepareAudience(authContext: AuthContext, input: unknown): Promise<{
        recipients: Array<{ contactId: string }>;
      }>;
    }).prepareAudience(auth, {
      channel: 'email',
      audience: {
        source: 'contacts',
        contactSearches: ['bzs.com.br'],
        excludedContactIds: ['contact-excluded'],
      },
    });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        organizationId: auth.organizationId,
        archivedAt: null,
        id: { notIn: ['contact-excluded'] },
        email: { not: null },
        OR: [{
          OR: [
            { name: { contains: 'bzs.com.br', mode: 'insensitive' } },
            { email: { contains: 'bzs.com.br', mode: 'insensitive' } },
            { phone: { contains: 'bzs.com.br' } },
          ],
        }],
      },
      select: { id: true },
    });
    expect(result.recipients).toEqual([
      { contactId: 'contact-1', messages: [] },
      { contactId: 'contact-2', messages: [] },
    ]);
  });

  it('seleciona todos os contatos acessíveis quando a busca está vazia', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'contact-1' }]);
    const service = new CampaignsService({
      contact: { findMany },
    } as never, {} as never, {} as never);

    await (service as unknown as {
      prepareAudience(authContext: AuthContext, input: unknown): Promise<unknown>;
    }).prepareAudience(auth, {
      channel: 'email',
      audience: { source: 'contacts', contactSearches: [''] },
    });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        organizationId: auth.organizationId,
        archivedAt: null,
        email: { not: null },
      },
      select: { id: true },
    });
  });

  it('consulta o WhatsApp e pula o destinatário cujo número não existe', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const campaignUpdate = vi.fn().mockResolvedValue({});
    const tx = { campaignRecipient: { updateMany }, campaign: { update: campaignUpdate } };
    const db = {
      campaign: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'campaign-1',
          channel: 'WHATSAPP',
          status: 'DRAFT',
          segmentId: null,
          stats: { audienceSource: 'contacts' },
          instance: { instanceKey: 'comercial', status: 'CONNECTED' },
        }),
      },
      campaignRecipient: {
        count: vi.fn().mockResolvedValue(2),
        findMany: vi.fn().mockResolvedValue([
          { id: 'recipient-1', contact: { id: 'contact-1', phone: '+5511999999999', email: null, consentStatus: 'UNKNOWN', suppressions: [] } },
          { id: 'recipient-2', contact: { id: 'contact-2', phone: '+5511988888888', email: null, consentStatus: 'GRANTED', suppressions: [] } },
        ]),
      },
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const evolution = {
      checkWhatsappNumbers: vi.fn().mockResolvedValue([
        { number: '5511999999999', exists: true },
        { number: '5511988888888', exists: false },
      ]),
    };
    const service = new CampaignsService(db as never, {} as never, evolution as never);

    const result = await service.preflight(auth, 'campaign-1');

    expect(evolution.checkWhatsappNumbers).toHaveBeenCalledWith('comercial', ['+5511999999999', '+5511988888888']);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['recipient-2'] } },
      data: { status: 'SKIPPED', exclusionReason: 'Número não possui WhatsApp', whatsappVerifiedAt: null },
    }));
    expect(result).toEqual({
      audience: 2,
      eligible: 1,
      skipped: 1,
      reasons: { 'Número não possui WhatsApp': 1 },
    });
  });

  it('executa a pré-validação automaticamente ao iniciar', async () => {
    const db = {
      campaign: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'campaign-1',
          channel: 'WHATSAPP',
          status: 'DRAFT',
          segmentId: null,
          stats: {},
          instance: { instanceKey: 'comercial', status: 'CONNECTED' },
        }),
      },
    };
    const service = new CampaignsService(db as never, {} as never, {} as never);
    const preflight = vi.spyOn(service, 'preflight').mockResolvedValue({
      audience: 1,
      eligible: 0,
      skipped: 1,
      reasons: { 'Número não possui WhatsApp': 1 },
    });

    await expect(service.schedule(auth, 'campaign-1')).rejects.toThrow(/Nenhum contato válido/);
    expect(preflight).toHaveBeenCalledWith(auth, 'campaign-1');
  });

  it('classifica os contatos do CSV pelo WhatsApp ao carregar o arquivo', async () => {
    const db = {
      whatsappInstance: {
        findFirst: vi.fn().mockResolvedValue({ instanceKey: 'comercial' }),
      },
    };
    const evolution = {
      checkWhatsappNumbers: vi.fn().mockResolvedValue([
        { number: '5545999225389', exists: true },
        { number: '5545999112233', exists: false },
      ]),
    };
    const service = new CampaignsService(db as never, {} as never, evolution as never);

    const result = await service.previewCsv(auth, 'instance-1', [
      'nome;telefone;mensagem',
      'Maria;(45) 99922-5389;Olá Maria',
      'João;(45) 99911-2233;Olá João',
    ].join('\n'));

    expect(evolution.checkWhatsappNumbers).toHaveBeenCalledWith('comercial', ['+5545999225389', '+5545999112233']);
    expect(result).toMatchObject({ total: 2, valid: 1, invalid: 1 });
    expect(result.rows).toEqual([
      expect.objectContaining({ name: 'Maria', hasWhatsapp: true }),
      expect.objectContaining({ name: 'João', hasWhatsapp: false }),
    ]);
  });

  it('pula contatos sem e-mail ou descadastrados em campanhas de e-mail', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = { campaignRecipient: { updateMany }, campaign: { update: vi.fn() } };
    const db = {
      campaign: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'campaign-email',
          channel: 'EMAIL',
          status: 'DRAFT',
          segmentId: null,
          stats: {},
          instance: null,
        }),
      },
      campaignRecipient: {
        count: vi.fn().mockResolvedValue(3),
        findMany: vi.fn().mockResolvedValue([
          { id: 'recipient-1', contact: { id: 'contact-1', phone: null, email: 'valido@example.com', consentStatus: 'UNKNOWN', suppressions: [] } },
          { id: 'recipient-2', contact: { id: 'contact-2', phone: null, email: null, consentStatus: 'UNKNOWN', suppressions: [] } },
          { id: 'recipient-3', contact: { id: 'contact-3', phone: null, email: 'saiu@example.com', consentStatus: 'UNKNOWN', suppressions: [{ channel: 'EMAIL' }] } },
        ]),
      },
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new CampaignsService(db as never, {} as never, {} as never);

    const result = await service.preflight(auth, 'campaign-email');

    expect(result).toEqual({
      audience: 3,
      eligible: 1,
      skipped: 2,
      reasons: {
        'E-mail ausente': 1,
        'Contato descadastrado do e-mail': 1,
      },
    });
  });
});
