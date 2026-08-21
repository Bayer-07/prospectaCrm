import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../auth/types.js';
import { MediaService } from './media.service.js';

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('http://storage.local/upload'),
}));

const originalS3Secret = process.env.S3_SECRET_KEY;
process.env.S3_SECRET_KEY = 'test-only-s3-secret';

afterAll(() => {
  if (originalS3Secret === undefined) delete process.env.S3_SECRET_KEY;
  else process.env.S3_SECRET_KEY = originalS3Secret;
});

const auth: AuthContext = {
  type: 'session',
  organizationId: 'organization-1',
  userId: 'user-1',
  roleKey: 'admin',
  name: 'Gabriel',
  permissions: [],
};

describe('MediaService uploads', () => {
  const create = vi.fn();
  const findUnique = vi.fn();
  const service = new MediaService({ mediaAsset: { create, findUnique } } as never);

  beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue({ id: 'media-1' });
    findUnique.mockReset();
  });

  it('aceita áudio WebM/Opus e remove parâmetros do MIME antes de assinar', async () => {
    const result = await service.createUpload(auth, {
      filename: 'audio.webm',
      contentType: 'audio/webm;codecs=opus',
      sizeBytes: 2048,
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ contentType: 'audio/webm', filename: 'audio.webm', sizeBytes: 2048 }),
    });
    expect(result.uploadUrl).toBe('http://storage.local/upload');
  });

  it('confirma uma foto de perfil somente depois de validar o objeto armazenado', async () => {
    findUnique.mockResolvedValue({
      id: '14ee3455-a854-40ab-92dc-01d71c3dbef8',
      key: 'organization-1/2026-07-27/foto.webp',
      filename: 'foto.webp',
      contentType: 'image/webp',
      sizeBytes: 4096,
      messageId: null,
      createdAt: new Date('2026-07-27T12:00:00Z'),
      profilePhotoFor: null,
      companyLogoFor: null,
    });
    vi.spyOn((service as any).client, 'send').mockResolvedValueOnce({
      ContentLength: 4096,
      ContentType: 'image/webp',
    });

    await expect(service.confirmProfilePhotoAsset(auth, '14ee3455-a854-40ab-92dc-01d71c3dbef8'))
      .resolves.toEqual(expect.objectContaining({ contentType: 'image/webp', sizeBytes: 4096 }));
  });

  it('confirma uma logo de empresa somente depois de validar o objeto armazenado', async () => {
    findUnique.mockResolvedValue({
      id: '14ee3455-a854-40ab-92dc-01d71c3dbef8',
      key: 'organization-1/2026-08-06/logo.ico',
      filename: 'logo.ico',
      contentType: 'image/x-icon',
      sizeBytes: 8192,
      messageId: null,
      createdAt: new Date('2026-08-06T12:00:00Z'),
      profilePhotoFor: null,
      companyLogoFor: null,
    });
    vi.spyOn((service as any).client, 'send').mockResolvedValueOnce({
      ContentLength: 8192,
      ContentType: 'image/x-icon',
    });

    await expect(service.confirmCompanyLogoAsset(
      auth,
      '14ee3455-a854-40ab-92dc-01d71c3dbef8',
      'company-1',
    )).resolves.toEqual(expect.objectContaining({ contentType: 'image/x-icon', sizeBytes: 8192 }));
  });

  it('confirma um documento de proposta sem permitir reutilizar mídia já vinculada', async () => {
    findUnique.mockResolvedValue({
      id: '14ee3455-a854-40ab-92dc-01d71c3dbef8',
      key: 'organization-1/2026-08-10/proposta.pdf',
      filename: 'proposta.pdf',
      contentType: 'application/pdf',
      sizeBytes: 16_384,
      messageId: null,
      profilePhotoFor: null,
      companyLogoFor: null,
      quickReplyFor: null,
      opportunityProposalFor: null,
    });
    vi.spyOn((service as any).client, 'send').mockResolvedValueOnce({
      ContentLength: 16_384,
      ContentType: 'application/pdf',
    });

    await expect(service.confirmOpportunityProposalAsset(
      auth,
      '14ee3455-a854-40ab-92dc-01d71c3dbef8',
      'opportunity-1',
    )).resolves.toEqual(expect.objectContaining({ contentType: 'application/pdf', sizeBytes: 16_384 }));
  });

  it('valida o arquivo da base de conhecimento antes da indexação', async () => {
    findUnique.mockResolvedValue({
      id: '14ee3455-a854-40ab-92dc-01d71c3dbef8',
      key: 'organization-1/2026-08-20/manual.pdf',
      filename: 'manual.pdf',
      contentType: 'application/pdf',
      sizeBytes: 32_768,
      messageId: null,
      profilePhotoFor: null,
      companyLogoFor: null,
      quickReplyFor: null,
      opportunityProposalFor: null,
      aiKnowledgeDocument: null,
    });
    vi.spyOn((service as any).client, 'send').mockResolvedValueOnce({
      ContentLength: 32_768,
      ContentType: 'application/pdf',
    });

    await expect(service.confirmAiKnowledgeAsset(auth, '14ee3455-a854-40ab-92dc-01d71c3dbef8'))
      .resolves.toEqual(expect.objectContaining({ filename: 'manual.pdf', sizeBytes: 32_768 }));
  });

  it('rejeita formatos que o File Search da OpenAI não indexa', async () => {
    findUnique.mockResolvedValue({
      id: '14ee3455-a854-40ab-92dc-01d71c3dbef8',
      key: 'organization-1/2026-08-20/contatos.csv',
      filename: 'contatos.csv',
      contentType: 'text/csv',
      sizeBytes: 1024,
      messageId: null,
      profilePhotoFor: null,
      companyLogoFor: null,
      quickReplyFor: null,
      opportunityProposalFor: null,
      aiKnowledgeDocument: null,
    });

    await expect(service.confirmAiKnowledgeAsset(auth, '14ee3455-a854-40ab-92dc-01d71c3dbef8'))
      .rejects.toThrow('PowerPoint PPTX');
  });
});
