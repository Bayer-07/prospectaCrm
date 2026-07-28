import type { PrismaClient } from '@prisma/client';
import type { Job } from 'bullmq';
import { storedMediaBuffer } from './storage.js';
import { TranscriptionClient, TranscriptionConfigurationError } from './transcription-client.js';

type RealtimeEvent = {
  organizationId: string;
  event: 'inbox.updated';
  payload: { conversationId: string; messageId: string; transcriptionStatus: string };
};

export class AudioTranscriptionProcessor {
  constructor(
    private readonly db: PrismaClient,
    private readonly client = new TranscriptionClient(),
  ) {}

  async process(job: Job<{ messageId: string }>): Promise<RealtimeEvent | undefined> {
    const message = await this.db.message.findUnique({
      where: { id: job.data.messageId },
      select: {
        id: true,
        conversationId: true,
        type: true,
        transcriptionStatus: true,
        transcriptionText: true,
        conversation: { select: { organizationId: true } },
        media: {
          select: { key: true, filename: true, contentType: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!message || message.transcriptionStatus === 'COMPLETED' && message.transcriptionText) return;

    const audio = message.media.find((media) => media.contentType.toLowerCase().startsWith('audio/'))
      || (message.type === 'audio' ? message.media[0] : undefined);
    if (!audio) return this.fail(message, 'O arquivo deste áudio não está disponível');

    try {
      const maximumBytes = Math.min(
        Math.max(Number(process.env.TRANSCRIPTION_MAX_BYTES) || 25 * 1024 * 1024, 1 * 1024 * 1024),
        100 * 1024 * 1024,
      );
      const body = await storedMediaBuffer(audio.key, maximumBytes);
      const result = await this.client.transcribe({
        body,
        filename: audio.filename,
        contentType: audio.contentType,
      });
      await this.db.message.update({
        where: { id: message.id },
        data: {
          transcriptionStatus: 'COMPLETED',
          transcriptionText: result.text,
          transcriptionError: null,
          transcriptionProvider: result.provider,
          transcribedAt: new Date(),
        },
      });
      return this.event(message, 'COMPLETED');
    } catch (error) {
      const attempts = Number(job.opts.attempts || 1);
      const hasAnotherAttempt = job.attemptsMade + 1 < attempts;
      if (hasAnotherAttempt && !(error instanceof TranscriptionConfigurationError)) throw error;
      return this.fail(message, error instanceof Error ? error.message : String(error));
    }
  }

  private async fail(
    message: { id: string; conversationId: string; conversation: { organizationId: string } },
    error: string,
  ) {
    await this.db.message.update({
      where: { id: message.id },
      data: {
        transcriptionStatus: 'FAILED',
        transcriptionText: null,
        transcriptionError: error.slice(0, 1_000),
        transcriptionProvider: null,
        transcribedAt: null,
      },
    });
    return this.event(message, 'FAILED');
  }

  private event(
    message: { id: string; conversationId: string; conversation: { organizationId: string } },
    transcriptionStatus: string,
  ): RealtimeEvent {
    return {
      organizationId: message.conversation.organizationId,
      event: 'inbox.updated',
      payload: { conversationId: message.conversationId, messageId: message.id, transcriptionStatus },
    };
  }
}
