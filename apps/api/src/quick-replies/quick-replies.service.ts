import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthContext } from '../auth/types.js';
import { MediaService } from '../media/media.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type QuickReplyInput = {
  title: string;
  shortcut: string;
  text?: string | null;
  mediaAssetId?: string | null;
};

const quickReplyInclude = {
  mediaAsset: { select: { id: true, filename: true, contentType: true, sizeBytes: true } },
  createdBy: { select: { id: true, name: true } },
} as const;

function normalizedShortcut(value: unknown) {
  return String(value || '')
    .trim()
    .replace(/^\/+/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 40);
}

@Injectable()
export class QuickRepliesService {
  constructor(private readonly db: PrismaService, private readonly media: MediaService) {}

  list(auth: AuthContext, rawSearch?: string) {
    const search = String(rawSearch || '').trim().slice(0, 100);
    return this.db.quickReply.findMany({
      where: {
        organizationId: auth.organizationId,
        ...(search ? { OR: [
          { title: { contains: search, mode: 'insensitive' as const } },
          { shortcut: { contains: search.replace(/^\/+/, ''), mode: 'insensitive' as const } },
          { text: { contains: search, mode: 'insensitive' as const } },
        ] } : {}),
      },
      include: quickReplyInclude,
      orderBy: [{ shortcut: 'asc' }, { id: 'asc' }],
    });
  }

  async create(auth: AuthContext, input: QuickReplyInput) {
    if (!auth.userId) throw new BadRequestException('A resposta rápida exige um usuário autenticado');
    const data = this.validate(input);
    if (data.mediaAssetId) await this.media.confirmQuickReplyAsset(auth, data.mediaAssetId);
    try {
      const quickReply = await this.db.quickReply.create({
        data: {
          organizationId: auth.organizationId,
          createdById: auth.userId,
          ...data,
        },
        include: quickReplyInclude,
      });
      await this.audit(auth, 'quick_reply.created', quickReply.id, null, {
        title: quickReply.title,
        shortcut: quickReply.shortcut,
        mediaAssetId: quickReply.mediaAssetId,
      });
      return quickReply;
    } catch (error) {
      this.rethrowDuplicate(error);
    }
  }

  async update(auth: AuthContext, id: string, input: Partial<QuickReplyInput>) {
    const current = await this.find(auth, id);
    const replacingMedia = Object.prototype.hasOwnProperty.call(input, 'mediaAssetId');
    const mediaAssetId = replacingMedia ? String(input.mediaAssetId || '').trim() || null : current.mediaAssetId;
    const data = this.validate({
      title: input.title ?? current.title,
      shortcut: input.shortcut ?? current.shortcut,
      text: input.text === undefined ? current.text : input.text,
      mediaAssetId,
    });
    if (replacingMedia && data.mediaAssetId) await this.media.confirmQuickReplyAsset(auth, data.mediaAssetId, current.id);
    try {
      const quickReply = await this.db.quickReply.update({
        where: { id: current.id },
        data,
        include: quickReplyInclude,
      });
      await this.audit(auth, 'quick_reply.updated', quickReply.id, {
        title: current.title,
        shortcut: current.shortcut,
        mediaAssetId: current.mediaAssetId,
      }, {
        title: quickReply.title,
        shortcut: quickReply.shortcut,
        mediaAssetId: quickReply.mediaAssetId,
      });
      if (replacingMedia && current.mediaAssetId && current.mediaAssetId !== quickReply.mediaAssetId) {
        await this.media.deleteAsset(auth, current.mediaAssetId).catch(() => undefined);
      }
      return quickReply;
    } catch (error) {
      this.rethrowDuplicate(error);
    }
  }

  async remove(auth: AuthContext, id: string) {
    const current = await this.find(auth, id);
    await this.db.$transaction([
      this.db.quickReply.delete({ where: { id: current.id } }),
      this.db.auditLog.create({ data: {
        organizationId: auth.organizationId,
        userId: auth.userId,
        action: 'quick_reply.deleted',
        entityType: 'QuickReply',
        entityId: current.id,
        before: { title: current.title, shortcut: current.shortcut, mediaAssetId: current.mediaAssetId },
      } }),
    ]);
    if (current.mediaAssetId) await this.media.deleteAsset(auth, current.mediaAssetId).catch(() => undefined);
    return { id: current.id };
  }

  private find(auth: AuthContext, id: string) {
    return this.db.quickReply.findFirst({
      where: { id, organizationId: auth.organizationId },
      include: quickReplyInclude,
    }).then((quickReply) => {
      if (!quickReply) throw new NotFoundException('Resposta rápida não encontrada');
      return quickReply;
    });
  }

  private validate(input: QuickReplyInput) {
    const title = String(input.title || '').trim();
    const shortcut = normalizedShortcut(input.shortcut);
    const text = String(input.text || '').trim() || null;
    const mediaAssetId = String(input.mediaAssetId || '').trim() || null;
    if (!title || title.length > 100) throw new BadRequestException('Informe um nome de até 100 caracteres');
    if (!shortcut || shortcut.length < 2) throw new BadRequestException('Informe um atalho com pelo menos 2 caracteres');
    if (text && text.length > 4096) throw new BadRequestException('O texto deve ter no máximo 4096 caracteres');
    if (!text && !mediaAssetId) throw new BadRequestException('Informe um texto ou anexo');
    return { title, shortcut, text, mediaAssetId };
  }

  private audit(auth: AuthContext, action: string, entityId: string, before: object | null, after: object | null) {
    return this.db.auditLog.create({ data: {
      organizationId: auth.organizationId,
      userId: auth.userId,
      action,
      entityType: 'QuickReply',
      entityId,
      ...(before ? { before } : {}),
      ...(after ? { after } : {}),
    } });
  }

  private rethrowDuplicate(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new BadRequestException('Este atalho já está sendo usado por outra resposta rápida');
    }
    throw error;
  }
}
