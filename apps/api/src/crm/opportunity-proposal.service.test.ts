import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../auth/types.js';
import { CrmService } from './crm.service.js';

const auth: AuthContext = {
  type: 'session',
  organizationId: 'organization-1',
  userId: 'user-1',
  teamId: 'team-1',
  roleKey: 'admin',
  name: 'Administrador',
  permissions: [{ resource: '*', action: '*', scope: 'ALL' }],
};

function dependencies(current: { proposalUrl: string | null; proposalAssetId: string | null }) {
  const opportunity = {
    findFirst: vi.fn().mockResolvedValue({ id: 'opportunity-1', companyId: 'company-1', ...current }),
    update: vi.fn().mockResolvedValue({ id: 'opportunity-1', proposalUrl: null, proposalAssetId: null, proposalAsset: null }),
  };
  const db = {
    opportunity,
    auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
    outboundWebhook: { findMany: vi.fn().mockResolvedValue([]) },
    activity: { create: vi.fn().mockResolvedValue({ id: 'activity-1' }) },
  };
  const media = {
    confirmOpportunityProposalAsset: vi.fn().mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111' }),
    deleteAsset: vi.fn().mockResolvedValue(undefined),
    downloadUrl: vi.fn().mockResolvedValue({ url: 'https://storage.example/proposta.pdf' }),
  };
  return { db, opportunity, media, service: new CrmService(db as never, { add: vi.fn() } as never, media as never) };
}

describe('proposta da oportunidade', () => {
  it('normaliza e salva um link HTTP seguro', async () => {
    const { service, opportunity, media } = dependencies({ proposalUrl: null, proposalAssetId: null });

    await service.setOpportunityProposal(auth, 'opportunity-1', { type: 'link', url: 'propostas.bzs.com.br/cliente' });

    expect(opportunity.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'opportunity-1' },
      data: expect.objectContaining({
        proposalUrl: 'https://propostas.bzs.com.br/cliente',
        proposalAssetId: null,
        proposalAddedAt: expect.any(Date),
      }),
    }));
    expect(media.confirmOpportunityProposalAsset).not.toHaveBeenCalled();
  });

  it('vincula o arquivo validado e remove o arquivo anterior depois da troca', async () => {
    const oldAssetId = '22222222-2222-4222-8222-222222222222';
    const newAssetId = '11111111-1111-4111-8111-111111111111';
    const { service, opportunity, media } = dependencies({ proposalUrl: null, proposalAssetId: oldAssetId });

    await service.setOpportunityProposal(auth, 'opportunity-1', { type: 'FILE', mediaAssetId: newAssetId });

    expect(media.confirmOpportunityProposalAsset).toHaveBeenCalledWith(auth, newAssetId, 'opportunity-1');
    expect(opportunity.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ proposalUrl: null, proposalAssetId: newAssetId }),
    }));
    expect(media.deleteAsset).toHaveBeenCalledWith(auth, oldAssetId);
  });

  it('rejeita protocolos que não sejam HTTP ou HTTPS', async () => {
    const { service, opportunity } = dependencies({ proposalUrl: null, proposalAssetId: null });

    await expect(service.setOpportunityProposal(auth, 'opportunity-1', { type: 'LINK', url: 'javascript:alert(1)' }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(opportunity.update).not.toHaveBeenCalled();
  });

  it('gera a URL temporária somente após localizar a oportunidade no escopo do usuário', async () => {
    const assetId = '11111111-1111-4111-8111-111111111111';
    const { service, opportunity, media } = dependencies({ proposalUrl: null, proposalAssetId: assetId });

    await expect(service.opportunityProposalFileUrl(auth, 'opportunity-1')).resolves.toEqual({ url: 'https://storage.example/proposta.pdf' });

    expect(opportunity.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'opportunity-1', organizationId: auth.organizationId, archivedAt: null }),
      select: { proposalAssetId: true },
    }));
    expect(media.downloadUrl).toHaveBeenCalledWith(auth, assetId);
  });
});
