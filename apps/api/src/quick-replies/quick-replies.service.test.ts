import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { QuickRepliesService } from './quick-replies.service.js';

const auth = {
  type: 'session' as const,
  organizationId: 'organization-1',
  userId: 'user-1',
  name: 'Gabriel',
  permissions: [],
};

describe('respostas rápidas', () => {
  it('normaliza o atalho e valida o anexo antes de criar', async () => {
    const created = {
      id: 'reply-1', title: 'Apresentação', shortcut: 'apresentacao', text: 'Olá!', mediaAssetId: 'media-1',
    };
    const db = {
      quickReply: { create: vi.fn().mockResolvedValue(created) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const media = { confirmQuickReplyAsset: vi.fn().mockResolvedValue({ id: 'media-1' }) };
    const service = new QuickRepliesService(db as never, media as never);

    await expect(service.create(auth, {
      title: ' Apresentação ', shortcut: '/Apresentação ', text: ' Olá! ', mediaAssetId: 'media-1',
    })).resolves.toEqual(created);

    expect(media.confirmQuickReplyAsset).toHaveBeenCalledWith(auth, 'media-1');
    expect(db.quickReply.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organizationId: 'organization-1', createdById: 'user-1', title: 'Apresentação', shortcut: 'apresentacao', text: 'Olá!',
      }),
    }));
  });

  it('exige texto ou anexo', async () => {
    const service = new QuickRepliesService({} as never, {} as never);
    await expect(service.create(auth, { title: 'Vazia', shortcut: 'vazia', text: '' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('exclui o cadastro e remove o anexo que ficou órfão', async () => {
    const db = {
      quickReply: {
        findFirst: vi.fn().mockResolvedValue({ id: 'reply-1', title: 'PDF', shortcut: 'pdf', mediaAssetId: 'media-1' }),
        delete: vi.fn().mockReturnValue({ operation: 'delete' }),
      },
      auditLog: { create: vi.fn().mockReturnValue({ operation: 'audit' }) },
      $transaction: vi.fn().mockResolvedValue([]),
    };
    const media = { deleteAsset: vi.fn().mockResolvedValue(undefined) };
    const service = new QuickRepliesService(db as never, media as never);

    await expect(service.remove(auth, 'reply-1')).resolves.toEqual({ id: 'reply-1' });
    expect(db.$transaction).toHaveBeenCalledWith([{ operation: 'delete' }, { operation: 'audit' }]);
    expect(media.deleteAsset).toHaveBeenCalledWith(auth, 'media-1');
  });
});
