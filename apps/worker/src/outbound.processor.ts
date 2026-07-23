import type { Job } from 'bullmq';
import type { PrismaClient } from '@prisma/client';
import { EvolutionClient } from './evolution-client.js';
import { signedMediaUrl, storedMediaBase64 } from './storage.js';

export class OutboundProcessor {
  constructor(private readonly db: PrismaClient, private readonly evolution: EvolutionClient) {}

  async process(job: Job<{ messageId: string }>) {
    const message = await this.db.message.findUnique({
      where: { id: job.data.messageId },
      select: {
        id: true,
        conversationId: true,
        providerMessageId: true,
        type: true,
        text: true,
        status: true,
        payload: true,
        instance: { select: { instanceKey: true } },
        conversation: {
          select: {
            remoteJid: true,
            assigneeId: true,
            firstResponseAt: true,
            contact: { select: { phone: true } },
            chatbotSession: { select: { status: true } },
          },
        },
      },
    });
    if (!message || message.status !== 'QUEUED' || !message.conversation.contact.phone) return;
    const initialPayload = message.payload as Record<string, any>;
    if (initialPayload.automated && (message.conversation.assigneeId || message.conversation.chatbotSession?.status === 'STOPPED')) {
      await this.db.message.update({ where: { id: message.id }, data: { status: 'SKIPPED', payload: { ...initialPayload, skipReason: 'Atendimento humano assumido ou chatbot interrompido' } } });
      return;
    }
    try {
      const payload = message.payload as Record<string, any>;
      const mediaKey = payload.mediaKey ? String(payload.mediaKey) : undefined;
      const mediaBase64 = message.type === 'audio' && mediaKey ? await storedMediaBase64(mediaKey) : undefined;
      const mediaUrl = mediaKey && !mediaBase64 ? await signedMediaUrl(mediaKey) : undefined;
      const replyTarget = payload.replyToMessageId ? await this.db.message.findFirst({
        where: { id: String(payload.replyToMessageId), conversationId: message.conversationId },
        select: { providerMessageId: true, direction: true, type: true, text: true, payload: true },
      }) : null;
      const quoted = replyTarget && !replyTarget.providerMessageId.startsWith('local:') ? {
        key: {
          remoteJid: message.conversation.remoteJid,
          fromMe: replyTarget.direction === 'OUTBOUND',
          id: replyTarget.providerMessageId,
        },
        message: this.quotedMessageContent(replyTarget),
      } : undefined;
      const result = await this.evolution.send(message.instance.instanceKey, {
        number: message.conversation.remoteJid.includes('@lid') ? message.conversation.remoteJid : message.conversation.contact.phone,
        type: message.type, text: message.text || undefined,
        mediaUrl,
        mediaBase64,
        quoted,
      });
      const providerMessageId = String(result.key?.id || result.messageId || message.providerMessageId);
      await this.db.$transaction([
        this.db.message.update({ where: { id: message.id }, data: { providerMessageId, status: 'SENT', sentAt: new Date(), payload: { ...payload, provider: { key: result.key || null, message: result.message || null } } } }),
        this.db.conversation.update({ where: { id: message.conversationId }, data: { lastMessageAt: new Date(), firstResponseAt: message.conversation.firstResponseAt || new Date() } }),
      ]);
    } catch (error) {
      await this.db.message.update({ where: { id: message.id }, data: { status: 'FAILED', payload: { ...(message.payload as object), error: error instanceof Error ? error.message : String(error) } } });
      throw error;
    }
  }

  private quotedMessageContent(message: { type: string; text: string | null; payload: unknown }) {
    const payload = (message.payload || {}) as Record<string, any>;
    const providerMessage = payload.provider?.message;
    if (providerMessage && typeof providerMessage === 'object') return providerMessage as Record<string, unknown>;
    const inboundMessage = payload.message;
    if (inboundMessage && typeof inboundMessage === 'object') return inboundMessage as Record<string, unknown>;
    const text = message.text || `[${message.type}]`;
    if (message.type === 'image') return { imageMessage: { caption: text } };
    if (message.type === 'video') return { videoMessage: { caption: text } };
    if (message.type === 'document') return { documentMessage: { fileName: text } };
    return { conversation: text };
  }
}
