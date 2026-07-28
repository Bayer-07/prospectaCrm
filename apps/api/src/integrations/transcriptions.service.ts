import { BadRequestException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import type { AuthContext } from '../auth/types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TRANSCRIPTION_QUEUE } from '../queue/queue.module.js';
import { conversationVisibilityWhere } from './conversation-visibility.js';

const PROCESSING_TIMEOUT_MS = 10 * 60_000;

type TranscriptionMessage = {
  id: string;
  conversationId: string;
  type: string;
  payload: Prisma.JsonValue;
  transcriptionStatus: string | null;
  transcriptionText: string | null;
  transcriptionError: string | null;
  transcriptionProvider: string | null;
  transcribedAt: Date | null;
  updatedAt: Date;
  media: Array<{ id: string; contentType: string }>;
};

@Injectable()
export class TranscriptionsService {
  constructor(
    private readonly db: PrismaService,
    @Inject(TRANSCRIPTION_QUEUE) private readonly queue: Queue,
  ) {}

  async get(auth: AuthContext, conversationId: string, messageId: string) {
    return this.response(await this.audioMessage(auth, conversationId, messageId));
  }

  async request(auth: AuthContext, conversationId: string, messageId: string) {
    const message = await this.audioMessage(auth, conversationId, messageId);
    if (message.transcriptionStatus === 'COMPLETED' && message.transcriptionText) return this.response(message);

    const staleBefore = new Date(Date.now() - PROCESSING_TIMEOUT_MS);
    if (message.transcriptionStatus === 'PROCESSING' && message.updatedAt > staleBefore) return this.response(message);

    const reserved = await this.db.message.updateMany({
      where: {
        id: message.id,
        conversationId,
        OR: [
          { transcriptionStatus: { not: 'PROCESSING' } },
          { transcriptionStatus: null },
          { updatedAt: { lte: staleBefore } },
        ],
      },
      data: {
        transcriptionStatus: 'PROCESSING',
        transcriptionText: null,
        transcriptionError: null,
        transcriptionProvider: null,
        transcribedAt: null,
      },
    });
    if (!reserved.count) return this.get(auth, conversationId, messageId);

    try {
      await this.queue.add('transcribe-audio', { messageId: message.id }, {
        jobId: `audio-transcription-${message.id}-${Date.now()}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2_000 },
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await this.db.message.update({
        where: { id: message.id },
        data: { transcriptionStatus: 'FAILED', transcriptionError: `Não foi possível enfileirar a transcrição: ${detail}`.slice(0, 1_000) },
      });
      throw new ServiceUnavailableException('O serviço de transcrição está indisponível no momento');
    }

    return {
      messageId: message.id,
      status: 'PROCESSING',
      text: null,
      error: null,
      provider: null,
      transcribedAt: null,
    };
  }

  private async audioMessage(auth: AuthContext, conversationId: string, messageId: string) {
    const conversation = await this.db.conversation.findFirst({
      where: {
        id: conversationId,
        organizationId: auth.organizationId,
        ...conversationVisibilityWhere(auth, auth.roleKey === 'admin'),
      },
      select: { id: true },
    });
    if (!conversation) throw new NotFoundException('Conversa não encontrada');

    const message = await this.db.message.findFirst({
      where: { id: messageId, conversationId },
      select: {
        id: true,
        conversationId: true,
        type: true,
        payload: true,
        transcriptionStatus: true,
        transcriptionText: true,
        transcriptionError: true,
        transcriptionProvider: true,
        transcribedAt: true,
        updatedAt: true,
        media: { select: { id: true, contentType: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!message) throw new NotFoundException('Mensagem não encontrada');

    const payload = message.payload && typeof message.payload === 'object' && !Array.isArray(message.payload)
      ? message.payload as Record<string, Prisma.JsonValue>
      : {};
    const originalType = typeof payload.originalType === 'string' ? payload.originalType : message.type;
    const hasAudio = originalType === 'audio' || message.media.some((media) => media.contentType.toLowerCase().startsWith('audio/'));
    if (!hasAudio || !message.media.length) throw new BadRequestException('O arquivo deste áudio não está disponível para transcrição');
    return message satisfies TranscriptionMessage;
  }

  private response(message: TranscriptionMessage) {
    return {
      messageId: message.id,
      status: message.transcriptionStatus || 'IDLE',
      text: message.transcriptionText,
      error: message.transcriptionError,
      provider: message.transcriptionProvider,
      transcribedAt: message.transcribedAt,
    };
  }
}
