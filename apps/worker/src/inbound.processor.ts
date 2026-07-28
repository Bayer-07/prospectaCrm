import type { Job, Queue } from 'bullmq';
import { Prisma, PrismaClient, type MessageStatus } from '@prisma/client';
import { extractSharedWhatsappContacts, isOptOutMessage, normalizeEvolutionInstanceStatus, normalizePhoneKey } from '@prospecta/contracts';
import { createDecipheriv, createHash, hkdfSync } from 'node:crypto';
import { EvolutionClient } from './evolution-client.js';
import { storeInboundMedia } from './storage.js';

type AnyObject = Record<string, any>;
type StoredMessageResult = {
  conversationId: string;
  newMessage?: {
    id: string;
    direction: 'INBOUND' | 'OUTBOUND';
    assigneeId: string | null;
  };
};

const MEDIA_TYPES = new Set(['sticker', 'image', 'audio', 'video', 'document']);
const CAPTION_MEDIA_TYPES = new Set(['image', 'video', 'document']);
const RECENT_SYNC_BASE_DELAY_MS = 5_000;
const RECENT_SYNC_MAX_DELAY_MS = 15_000;
const CONNECTED_INSTANCE_CACHE_MS = 60_000;
const RECENT_MESSAGE_CACHE_MS = 10_000;
const TARGETED_LOOKUP_CACHE_MS = 3_000;
const INSTANCE_EVENT_TOUCH_INTERVAL_MS = 10_000;
const configuredMediaConcurrency = Number(process.env.MEDIA_PROCESSING_CONCURRENCY || 1);
const MEDIA_PROCESSING_CONCURRENCY = Number.isFinite(configuredMediaConcurrency)
  ? Math.min(Math.max(Math.trunc(configuredMediaConcurrency), 1), 2)
  : 1;

class Semaphore {
  private available: number;
  private readonly waiting: Array<() => void> = [];

  constructor(limit: number) { this.available = limit; }

  async run<T>(operation: () => Promise<T>) {
    if (this.available > 0) this.available -= 1;
    else await new Promise<void>((resolve) => this.waiting.push(resolve));
    try { return await operation(); }
    finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.available += 1;
    }
  }
}

const mediaProcessing = new Semaphore(MEDIA_PROCESSING_CONCURRENCY);

type SyncInstance = {
  id: string;
  organizationId: string;
  instanceKey: string;
  connectedAt: Date | null;
  teams: Array<{ teamId: string }>;
};

type RecentSyncState = {
  nextAt: number;
  delayMs: number;
  fingerprint: string;
  fetchedAt: number;
  records: AnyObject[];
};

export const nextEvolutionSyncDelay = (currentDelayMs: number, activity: boolean, failed = false) => {
  if (activity) return RECENT_SYNC_BASE_DELAY_MS;
  const multiplier = failed ? 2 : 1.5;
  return Math.min(RECENT_SYNC_MAX_DELAY_MS, Math.max(RECENT_SYNC_BASE_DELAY_MS, Math.round(currentDelayMs * multiplier)));
};

export const evolutionMessagesFingerprint = (records: AnyObject[]) => records.map((record) => {
  const key = record.key || record.Info || record.info || {};
  const content = record.message || record.Message || record;
  const text = evolutionMessageText(content) || '';
  return `${String(key.id || key.ID || record.id || '')}:${String(record.messageTimestamp || record.timestamp || '')}:${evolutionMessageType(content)}:${text}`;
}).join('|');

export const evolutionMessageNeedsReconciliation = (
  existing: { type: string; text?: string | null; media: Array<{ id: string }> },
  record: AnyObject,
) => {
  const content = record.message || record.Message || record;
  const type = evolutionMessageType(content);
  const text = evolutionMessageText(content);
  return (existing.type !== type && type !== 'text')
    || (!existing.text && Boolean(text))
    || (MEDIA_TYPES.has(type) && existing.media.length === 0);
};

export const normalizeEvolutionEventType = (eventType: string) => eventType.toUpperCase().replace(/[-.]/g, '_');
export const evolutionMessageUpdateId = (data: AnyObject) => String(data.keyId || data.key?.id || data.key?.ID || data.id || '');
export const evolutionMessageUpdateStatus = (data: AnyObject): MessageStatus => {
  const rawStatus = String(data.status || data.update?.status || '').toUpperCase();
  return rawStatus.includes('READ') ? 'READ' : rawStatus.includes('DELIVER') ? 'DELIVERED' : rawStatus.includes('ERROR') || rawStatus.includes('FAIL') ? 'FAILED' : 'SENT';
};
const deliveryStatusRank: Record<string, number> = { PENDING: 0, QUEUED: 1, SENT: 2, DELIVERED: 3, READ: 4 };
export const advanceEvolutionMessageStatus = (current: string, incoming: string): MessageStatus => {
  if (incoming === 'FAILED') return (current === 'DELIVERED' || current === 'READ' ? current : 'FAILED') as MessageStatus;
  if (current === 'FAILED') return incoming as MessageStatus;
  const currentRank = deliveryStatusRank[current];
  const incomingRank = deliveryStatusRank[incoming];
  if (currentRank === undefined || incomingRank === undefined) return current as MessageStatus;
  return (incomingRank > currentRank ? incoming : current) as MessageStatus;
};
export const incomingConversationStatus = (assigneeId?: string | null): 'OPEN' | 'WAITING' => assigneeId ? 'OPEN' : 'WAITING';
type IncomingConversationRoute = { status: 'OPEN' | 'WAITING'; assigneeId: string | null; reopened: boolean };
export const incomingConversationRoute = (currentStatus: string, assigneeId?: string | null): IncomingConversationRoute => currentStatus === 'CLOSED'
  ? { status: 'WAITING' as const, assigneeId: null, reopened: true }
  : { status: incomingConversationStatus(assigneeId), assigneeId: assigneeId || null, reopened: false };
export const evolutionReaction = (data: AnyObject) => {
  const content = data.message || data.Message || data;
  const reaction = content?.reactionMessage;
  const targetProviderMessageId = String(reaction?.key?.id || reaction?.key?.ID || '');
  if (!reaction || !targetProviderMessageId) return null;
  return { targetProviderMessageId, emoji: String(reaction.text || '') };
};

export const evolutionReplyProviderMessageId = (data: AnyObject) => {
  const content = unwrapEvolutionMessage(data.message || data.Message || data);
  const context = data.contextInfo
    || content.extendedTextMessage?.contextInfo
    || content.imageMessage?.contextInfo
    || content.videoMessage?.contextInfo
    || content.documentMessage?.contextInfo
    || content.audioMessage?.contextInfo
    || content.contactMessage?.contextInfo
    || content.contextInfo;
  const providerMessageId = context?.stanzaId || context?.key?.id || context?.key?.ID;
  return typeof providerMessageId === 'string' && providerMessageId.trim() ? providerMessageId : null;
};

export const unwrapEvolutionMessage = (input: AnyObject) => {
  let message = input || {};
  for (let depth = 0; depth < 6; depth += 1) {
    const wrapped = message.documentWithCaptionMessage?.message
      || message.ephemeralMessage?.message
      || message.viewOnceMessage?.message
      || message.viewOnceMessageV2?.message
      || message.viewOnceMessageV2Extension?.message;
    if (!wrapped || wrapped === message) break;
    message = wrapped;
  }
  return message;
};

export const evolutionMessageText = (input: AnyObject): string | null => {
  const message = unwrapEvolutionMessage(input);
  const sharedContacts = extractSharedWhatsappContacts(message);
  if (sharedContacts.length) return sharedContacts.map((contact) => contact.name).join(', ');
  const value = message.conversation
    || message.extendedTextMessage?.text
    || message.imageMessage?.caption
    || message.videoMessage?.caption
    || message.documentMessage?.caption
    || message.caption
    || message.text
    || message.body;
  return typeof value === 'string' && value.trim() ? value : null;
};

export const evolutionMessageType = (input: AnyObject) => {
  const message = unwrapEvolutionMessage(input);
  if (message.contactMessage || message.contactsArrayMessage) return 'contact';
  if (message.stickerMessage) return 'sticker';
  if (message.imageMessage) return 'image';
  if (message.audioMessage) return 'audio';
  if (message.videoMessage) return 'video';
  if (message.documentMessage) return 'document';
  if (message.reactionMessage) return 'reaction';
  return 'text';
};

export const evolutionMessageDate = (data: AnyObject, fallback = new Date()) => {
  const timestamp = Number(data.messageTimestamp || data.timestamp || 0);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return fallback;
  const occurredAt = new Date(timestamp * 1000);
  return Number.isNaN(occurredAt.getTime()) ? fallback : occurredAt;
};

export const isSynchronizableEvolutionMessage = (data: AnyObject, since: Date) => {
  const key = data.key || data.Info || data.info || {};
  const providerMessageId = String(key.id || key.ID || data.id || '');
  const remoteJid = String(key.remoteJid || key.Chat || data.remoteJid || data.from || '');
  if (!providerMessageId || !remoteJid || remoteJid.includes('@g.us') || remoteJid.includes('@broadcast')) return false;
  if (evolutionMessageDate(data, new Date(0)) < since) return false;
  const content = data.message || data.Message || data;
  const type = evolutionMessageType(content);
  if (type === 'reaction') return Boolean(evolutionReaction(data));
  if (type === 'text') return Boolean(evolutionMessageText(content));
  return ['sticker', 'image', 'audio', 'video', 'document', 'contact'].includes(type);
};

const mediaNode = (record: AnyObject, type: string) => {
  const content = unwrapEvolutionMessage(record.message || record.Message || record);
  return content[`${type}Message`] || {};
};

const normalizedFilename = (value: unknown) => String(value || '').normalize('NFC').toLocaleLowerCase('pt-BR');
const mediaSha = (value: unknown) => value && typeof value === 'object' ? JSON.stringify(value) : String(value || '');

export const evolutionMediaCaptionCandidate = (stored: AnyObject, candidates: AnyObject[]) => {
  const storedContent = stored.message || stored.Message || stored;
  const type = evolutionMessageType(storedContent);
  if (!['image', 'video', 'document'].includes(type)) return null;
  const originalNode = mediaNode(stored, type);
  const originalFilename = normalizedFilename(originalNode.fileName || originalNode.title);
  const originalSha = mediaSha(originalNode.fileSha256);
  const originalTimestamp = Number(stored.messageTimestamp || 0);
  const originalFromMe = Boolean(stored.key?.fromMe);

  return candidates
    .map((candidate) => ({ candidate, text: evolutionMessageText(candidate.message || candidate.Message || candidate) }))
    .filter(({ candidate, text }) => {
      if (!text || evolutionMessageType(candidate.message || candidate.Message || candidate) !== type) return false;
      if (Boolean(candidate.key?.fromMe) !== originalFromMe) return false;
      const candidateNode = mediaNode(candidate, type);
      const filenameMatches = originalFilename && normalizedFilename(candidateNode.fileName || candidateNode.title) === originalFilename;
      const shaMatches = originalSha && mediaSha(candidateNode.fileSha256) === originalSha;
      const candidateTimestamp = Number(candidate.messageTimestamp || 0);
      const closeInTime = !originalTimestamp || !candidateTimestamp || Math.abs(candidateTimestamp - originalTimestamp) <= 180;
      return closeInTime && Boolean(filenameMatches || shaMatches);
    })
    .sort((left, right) => Math.abs(Number(left.candidate.messageTimestamp || 0) - originalTimestamp) - Math.abs(Number(right.candidate.messageTimestamp || 0) - originalTimestamp))[0]
    || null;
};

export const evolutionCaptionRelation = (stored: AnyObject, candidate: AnyObject): 'companion' | 'replacement' => {
  const storedTimestamp = Number(stored.messageTimestamp || 0);
  const candidateTimestamp = Number(candidate.messageTimestamp || 0);
  return storedTimestamp && candidateTimestamp && candidateTimestamp <= storedTimestamp ? 'companion' : 'replacement';
};

export const deletedMessagePayload = (message: { type: string; text?: string | null; payload?: unknown }, deletedAt = new Date().toISOString()) => {
  const payload = message.payload && typeof message.payload === 'object' && !Array.isArray(message.payload) ? message.payload as AnyObject : {};
  return {
    ...payload,
    deleted: true,
    deletedAt,
    originalType: payload.originalType || message.type,
    originalText: payload.originalText ?? message.text ?? null,
  };
};

type SecretEditEnvelope = {
  providerMessageId: string;
  targetProviderMessageId: string;
  encryptedPayload: Buffer;
  iv: Buffer;
};

type DecodedMessageEdit = {
  targetProviderMessageId: string;
  text: string;
  providerMessageId?: string;
};

const evolutionBytes = (value: unknown): Buffer | null => {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (Array.isArray(value)) return Buffer.from(value);
  if (!value || typeof value !== 'object') return null;
  const record = value as AnyObject;
  if (typeof record.data === 'string') return Buffer.from(record.data, 'base64');
  if (Array.isArray(record.data)) return Buffer.from(record.data);
  const numericKeys = Object.keys(record).filter((key) => /^\d+$/.test(key)).sort((left, right) => Number(left) - Number(right));
  return numericKeys.length ? Buffer.from(numericKeys.map((key) => Number(record[key]) || 0)) : null;
};

const protobufFields = (input: Buffer) => {
  const fields: Array<{ field: number; wire: number; bytes?: Buffer; value?: bigint }> = [];
  let offset = 0;
  const readVarint = () => {
    let value = 0n;
    let shift = 0n;
    for (let count = 0; count < 10 && offset < input.length; count += 1) {
      const byte = input[offset++];
      value |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return value;
      shift += 7n;
    }
    throw new Error('Protobuf inválido');
  };
  while (offset < input.length) {
    const tag = readVarint();
    const field = Number(tag >> 3n);
    const wire = Number(tag & 7n);
    if (!field) throw new Error('Campo protobuf inválido');
    if (wire === 0) fields.push({ field, wire, value: readVarint() });
    else if (wire === 1) {
      if (offset + 8 > input.length) throw new Error('Protobuf truncado');
      offset += 8;
      fields.push({ field, wire });
    } else if (wire === 2) {
      const length = Number(readVarint());
      if (!Number.isSafeInteger(length) || length < 0 || offset + length > input.length) throw new Error('Protobuf truncado');
      fields.push({ field, wire, bytes: input.subarray(offset, offset + length) });
      offset += length;
    } else if (wire === 5) {
      if (offset + 4 > input.length) throw new Error('Protobuf truncado');
      offset += 4;
      fields.push({ field, wire });
    } else {
      throw new Error(`Wire type protobuf não suportado: ${wire}`);
    }
  }
  return fields;
};

const protobufText = (input: Buffer, field: number) => {
  const value = protobufFields(input).find((item) => item.field === field && item.wire === 2)?.bytes?.toString('utf8').trim();
  return value || null;
};

const decodedWhatsappMessageText = (message: Buffer): string | null => {
  const fields = protobufFields(message);
  const conversation = fields.find((item) => item.field === 1 && item.wire === 2)?.bytes?.toString('utf8').trim();
  if (conversation) return conversation;
  const nestedTextFields: Array<[number, number]> = [
    [6, 1], // extendedTextMessage.text
    [3, 3], // imageMessage.caption
    [9, 7], // videoMessage.caption
    [7, 20], // documentMessage.caption
  ];
  for (const [messageField, textField] of nestedTextFields) {
    const nested = fields.find((item) => item.field === messageField && item.wire === 2)?.bytes;
    if (!nested) continue;
    const text = protobufText(nested, textField);
    if (text) return text;
  }
  return null;
};

export const decodeWhatsappSecretEdit = (plaintext: Buffer): Omit<DecodedMessageEdit, 'providerMessageId'> | null => {
  try {
    const protocol = protobufFields(plaintext).find((item) => item.field === 12 && item.wire === 2)?.bytes;
    if (!protocol) return null;
    const protocolFields = protobufFields(protocol);
    const type = protocolFields.find((item) => item.field === 2 && item.wire === 0)?.value;
    if (type !== 14n) return null;
    const key = protocolFields.find((item) => item.field === 1 && item.wire === 2)?.bytes;
    const editedMessage = protocolFields.find((item) => item.field === 14 && item.wire === 2)?.bytes;
    if (!key || !editedMessage) return null;
    const targetProviderMessageId = protobufText(key, 3);
    const text = decodedWhatsappMessageText(editedMessage);
    return targetProviderMessageId && text ? { targetProviderMessageId, text } : null;
  } catch {
    return null;
  }
};

export const evolutionSecretEditEnvelope = (input: AnyObject): SecretEditEnvelope | null => {
  const data = Array.isArray(input.data) ? input.data[0] : input.data || input;
  const content = unwrapEvolutionMessage(data.message || data.Message || data);
  const secret = content.secretEncryptedMessage;
  if (!secret || Number(secret.secretEncType) !== 2) return null;
  const targetProviderMessageId = String(secret.targetMessageKey?.id || secret.targetMessageKey?.ID || '');
  const providerMessageId = String(data.key?.id || data.key?.ID || data.id || '');
  const encryptedPayload = evolutionBytes(secret.encPayload);
  const iv = evolutionBytes(secret.encIv || secret.encIV);
  return targetProviderMessageId && providerMessageId && encryptedPayload?.length && iv?.length
    ? { targetProviderMessageId, providerMessageId, encryptedPayload, iv }
    : null;
};

const normalizedJid = (value: unknown) => {
  const jid = String(value || '').trim();
  if (!jid.includes('@')) return '';
  return jid.replace(/:\d+@/, '@');
};

const editCandidateJids = (...sources: AnyObject[]) => [...new Set(sources.flatMap((source) => {
  const data = Array.isArray(source?.data) ? source.data[0] : source?.data || source || {};
  const content = unwrapEvolutionMessage(data.message || data.Message || data);
  const target = content.secretEncryptedMessage?.targetMessageKey || {};
  const key = data.key || data.Info || data.info || {};
  return [
    key.remoteJid,
    key.remoteJidAlt,
    key.participant,
    target.remoteJid,
    target.participant,
    data.remoteJid,
    data.phoneJid,
  ].map(normalizedJid).filter(Boolean);
}))];

export const decryptEvolutionSecretEdit = (
  editInput: AnyObject,
  originalPayload: AnyObject,
  ...candidateSources: AnyObject[]
): DecodedMessageEdit | null => {
  const envelope = evolutionSecretEditEnvelope(editInput);
  if (!envelope) return null;
  const originalContent = unwrapEvolutionMessage(originalPayload.message || originalPayload.Message || originalPayload);
  const messageSecret = evolutionBytes(originalContent.messageContextInfo?.messageSecret || originalPayload.messageSecret);
  if (!messageSecret?.length) return null;
  const candidates = editCandidateJids(editInput, originalPayload, ...candidateSources);
  for (const originalSender of candidates) {
    for (const editor of candidates) {
      const useCase = Buffer.from(`${envelope.targetProviderMessageId}${originalSender}${editor}Message Edit`);
      const key = Buffer.from(hkdfSync('sha256', messageSecret, Buffer.alloc(0), useCase, 32));
      const encrypted = envelope.encryptedPayload.subarray(0, -16);
      const authenticationTag = envelope.encryptedPayload.subarray(-16);
      if (!encrypted.length || authenticationTag.length !== 16) continue;
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, envelope.iv);
        decipher.setAuthTag(authenticationTag);
        const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        const decoded = decodeWhatsappSecretEdit(plaintext);
        if (decoded?.targetProviderMessageId === envelope.targetProviderMessageId) {
          return { ...decoded, providerMessageId: envelope.providerMessageId };
        }
      } catch {
        // LID/PN migrations can leave more than one plausible author. Try the next pair.
      }
    }
  }
  return null;
};

export const evolutionEditedMessage = (input: AnyObject): DecodedMessageEdit | null => {
  const data = Array.isArray(input.data) ? input.data[0] : input.data || input;
  const protocol = data.protocolMessage
    || data.message?.protocolMessage
    || data.editedMessage?.message?.protocolMessage
    || (data.key && data.editedMessage ? data : null);
  const targetProviderMessageId = String(protocol?.key?.id || protocol?.key?.ID || '');
  const text = evolutionMessageText(protocol?.editedMessage || {});
  return targetProviderMessageId && text ? { targetProviderMessageId, text } : null;
};

export const editedMessagePayload = (
  message: { text?: string | null; payload?: unknown },
  text: string,
  editedAt: string,
  editIdentity: string,
) => {
  const payload = message.payload && typeof message.payload === 'object' && !Array.isArray(message.payload)
    ? message.payload as AnyObject
    : {};
  const editEventIds = Array.isArray(payload.editEventIds) ? payload.editEventIds.filter((item: unknown) => typeof item === 'string').slice(-19) : [];
  if (editEventIds.includes(editIdentity)) return null;
  const editHistory = Array.isArray(payload.editHistory) ? payload.editHistory.slice(-9) : [];
  return {
    ...payload,
    edited: true,
    editedAt,
    editedBy: null,
    editedSource: 'WHATSAPP',
    editEventIds: [...editEventIds, editIdentity],
    editHistory: message.text === text
      ? editHistory
      : [...editHistory, { text: message.text || '', editedAt, editedBy: null }],
  };
};

export class InboundProcessor {
  private connectedInstancesCache?: { expiresAt: number; instances: SyncInstance[] };
  private readonly recentSyncState = new Map<string, RecentSyncState>();
  private readonly targetedLookupCache = new Map<string, { expiresAt: number; request: Promise<AnyObject[]> }>();
  private readonly lastInstanceEventWriteAt = new Map<string, number>();

  constructor(private readonly db: PrismaClient, private readonly chatbotQueue?: Queue, private readonly evolution = new EvolutionClient(), private readonly inboundQueue?: Queue) {}

  async process(job: Job<{ eventId?: string; messageId?: string }>) {
    if (job.name === 'repair-media-caption' && job.data.messageId) return this.repairMediaCaption(job.data.messageId);
    if (!job.data.eventId) return;
    const event = await this.db.inboundWebhookEvent.findUnique({ where: { id: job.data.eventId } });
    if (!event || event.status === 'processed') return;
    const payload = event.payload as AnyObject;
    const instance = await this.db.whatsappInstance.findFirst({ where: { instanceKey: event.instanceKey }, include: { teams: true } });
    if (!instance) {
      await this.db.inboundWebhookEvent.update({ where: { id: event.id }, data: { status: 'ignored', error: 'Instância não cadastrada', processedAt: new Date() } });
      return;
    }
    try {
      const eventType = normalizeEvolutionEventType(event.eventType);
      await this.touchInstanceEvent(instance.id);
      this.markEvolutionActivity(instance.id);
      let conversationId: string | undefined;
      let newMessage: StoredMessageResult['newMessage'];
      if (eventType.includes('CONNECTION')) await this.connection(instance.id, payload);
      else if (eventType.includes('MESSAGES_UPSERT') || eventType === 'MESSAGE' || eventType.includes('SEND_MESSAGE')) {
        const result = await this.message(instance, payload);
        conversationId = result?.conversationId;
        newMessage = result?.newMessage;
      }
      else if (eventType.includes('MESSAGES_EDITED')) conversationId = await this.messageEdited(instance.id, payload);
      else if (eventType.includes('MESSAGES_UPDATE')) conversationId = await this.messageUpdate(instance.id, payload);
      else if (eventType.includes('MESSAGES_DELETE')) conversationId = await this.messageDelete(instance.id, payload);
      await this.db.inboundWebhookEvent.update({ where: { id: event.id }, data: { status: 'processed', processedAt: new Date() } });
      return {
        organizationId: instance.organizationId,
        event: eventType.includes('CONNECTION') ? 'whatsapp.updated' : 'inbox.updated',
        payload: { instanceId: instance.id, ...(conversationId ? { conversationId } : {}), ...(newMessage ? { newMessage } : {}) },
      };
    } catch (error) {
      await this.db.inboundWebhookEvent.update({ where: { id: event.id }, data: { status: 'failed', error: error instanceof Error ? error.message : String(error) } });
      throw error;
    }
  }

  async syncRecentMessages(windowMs = 5 * 60_000) {
    const events: Array<{ organizationId: string; event: 'inbox.updated'; payload: { instanceId: string } }> = [];
    const now = Date.now();
    const instances = await this.connectedInstances(now);
    const connectedIds = new Set(instances.map((instance) => instance.id));
    for (const instanceId of this.recentSyncState.keys()) {
      if (!connectedIds.has(instanceId)) this.recentSyncState.delete(instanceId);
    }

    for (const instance of instances) {
      const state = this.recentSyncState.get(instance.id) || {
        nextAt: 0,
        delayMs: RECENT_SYNC_BASE_DELAY_MS,
        fingerprint: '',
        fetchedAt: 0,
        records: [],
      };
      this.recentSyncState.set(instance.id, state);
      if (state.nextAt > now) continue;

      try {
        const connectedAt = instance.connectedAt?.getTime() || 0;
        const since = new Date(Math.max(now - windowMs, connectedAt));
        const recent = (await this.evolution.findMessages(instance.instanceKey, undefined, 50))
          .filter((record) => isSynchronizableEvolutionMessage(record, since))
          .sort((left, right) => evolutionMessageDate(left, new Date(0)).getTime() - evolutionMessageDate(right, new Date(0)).getTime());
        const fingerprint = evolutionMessagesFingerprint(recent);
        const changed = fingerprint !== state.fingerprint;
        state.records = recent;
        state.fetchedAt = now;
        state.delayMs = nextEvolutionSyncDelay(state.delayMs, changed);
        state.nextAt = now + state.delayMs;
        if (!changed) continue;
        if (!recent.length) {
          state.fingerprint = fingerprint;
          continue;
        }

        const providerIds = recent.map((record) => String(record.key?.id || record.key?.ID || record.id || '')).filter(Boolean);
        const existing = await this.db.message.findMany({
          where: { instanceId: instance.id, providerMessageId: { in: providerIds } },
          select: {
            providerMessageId: true,
            type: true,
            text: true,
            media: { select: { id: true }, take: 1 },
          },
        });
        const knownMessages = new Map(existing.map((message) => [message.providerMessageId, message]));
        let imported = 0;

        for (const record of recent) {
          const providerMessageId = String(record.key?.id || record.key?.ID || record.id || '');
          if (!providerMessageId) continue;
          const knownMessage = knownMessages.get(providerMessageId);
          if (knownMessage && !evolutionMessageNeedsReconciliation(knownMessage, record)) continue;
          try {
            await this.message(instance, { data: record });
            if (!knownMessage) imported += 1;
          } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
              continue;
            }
            throw error;
          }
        }
        state.fingerprint = fingerprint;

        if (imported > 0) {
          await this.db.whatsappInstance.update({ where: { id: instance.id }, data: { lastEventAt: new Date() } });
          console.log(`[evolution-sync] ${imported} mensagem(ns) recente(s) importada(s) de ${instance.instanceKey}.`);
          events.push({ organizationId: instance.organizationId, event: 'inbox.updated', payload: { instanceId: instance.id } });
        }
      } catch (error) {
        state.delayMs = nextEvolutionSyncDelay(state.delayMs, false, true);
        state.nextAt = now + state.delayMs;
        console.error(`[evolution-sync] Falha ao sincronizar ${instance.instanceKey}:`, error instanceof Error ? error.message : error);
      }
    }

    return events;
  }

  private async connection(instanceId: string, payload: AnyObject) {
    const data = payload.data || payload;
    const state = String(data.state || data.status || data.connection || '').toLowerCase();
    const status = normalizeEvolutionInstanceStatus(state);
    await this.db.whatsappInstance.update({ where: { id: instanceId }, data: { status, connectedAt: status === 'CONNECTED' ? new Date() : null } });
    this.connectedInstancesCache = undefined;
    if (status === 'CONNECTED') this.markEvolutionActivity(instanceId, true);
    else this.recentSyncState.delete(instanceId);
  }

  private async connectedInstances(now: number): Promise<SyncInstance[]> {
    if (this.connectedInstancesCache && this.connectedInstancesCache.expiresAt > now) return this.connectedInstancesCache.instances;
    const instances = await this.db.whatsappInstance.findMany({
      where: { status: 'CONNECTED' },
      select: {
        id: true,
        organizationId: true,
        instanceKey: true,
        connectedAt: true,
        teams: { select: { teamId: true } },
      },
    });
    this.connectedInstancesCache = { expiresAt: now + CONNECTED_INSTANCE_CACHE_MS, instances };
    return instances;
  }

  private markEvolutionActivity(instanceId: string, immediate = false) {
    const state = this.recentSyncState.get(instanceId);
    if (!state) return;
    state.delayMs = RECENT_SYNC_BASE_DELAY_MS;
    state.nextAt = immediate ? 0 : Math.min(state.nextAt, Date.now() + RECENT_SYNC_BASE_DELAY_MS);
  }

  private async message(instance: { id: string; organizationId: string; instanceKey: string; teams: Array<{ teamId: string }> }, payload: AnyObject): Promise<StoredMessageResult | undefined> {
    const data = Array.isArray(payload.data) ? payload.data[0] : payload.data || payload;
    const occurredAt = evolutionMessageDate(data);
    const key = data.key || data.Info || data.info || {};
    const secretEdit = evolutionSecretEditEnvelope(data);
    if (secretEdit) {
      const conversationId = await this.secretMessageEdited(instance, data, secretEdit, occurredAt);
      return conversationId ? { conversationId } : undefined;
    }
    const remoteJid = String(key.remoteJid || key.Chat || data.remoteJid || data.from || '');
    if (!remoteJid || remoteJid.includes('@g.us')) return;
    const providerMessageId = String(key.id || key.ID || data.id || '');
    if (!providerMessageId) return;
    const fromMe = Boolean(key.fromMe ?? key.IsFromMe ?? data.fromMe);
    const reaction = evolutionReaction(data);
    if (reaction) {
      const conversationId = await this.applyReaction(instance.id, reaction, fromMe, String(data.pushName || key.PushName || data.senderName || (fromMe ? 'WhatsApp conectado' : 'Contato')));
      return conversationId ? { conversationId } : undefined;
    }
    const phoneDigits = remoteJid.includes('@s.whatsapp.net') ? remoteJid.split('@')[0].split(':')[0].replace(/\D/g, '') : '';
    const phone = phoneDigits ? `+${phoneDigits}` : undefined;
    const text = this.extractText(data.message || data.Message || data);
    const type = this.extractType(data.message || data.Message || data);
    const replyProviderMessageId = evolutionReplyProviderMessageId(data);
    const [existing, replyTarget] = await Promise.all([
      this.db.message.findUnique({
        where: { instanceId_providerMessageId: { instanceId: instance.id, providerMessageId } },
        select: {
          id: true,
          conversationId: true,
          type: true,
          text: true,
          payload: true,
          media: { select: { id: true }, take: 1 },
        },
      }),
      replyProviderMessageId
        ? this.db.message.findUnique({
          where: { instanceId_providerMessageId: { instanceId: instance.id, providerMessageId: replyProviderMessageId } },
          select: { id: true, conversationId: true },
        })
        : null,
    ]);
    if (existing) {
      const resolvedReply = replyTarget?.conversationId === existing.conversationId ? replyTarget : null;
      const storedPayload = resolvedReply
        ? { ...data, replyToMessageId: resolvedReply.id, replyToProviderMessageId: replyProviderMessageId }
        : data;
      const existingPayload = existing.payload as AnyObject;
      const shouldRefresh = (existing.type !== type && type !== 'text')
        || (!existing.text && Boolean(text))
        || Boolean(resolvedReply && existingPayload.replyToMessageId !== resolvedReply.id);
      const storedMessage = shouldRefresh
        ? await this.db.message.update({
          where: { id: existing.id },
          data: { type, text, payload: storedPayload as Prisma.InputJsonValue },
          select: { id: true },
        })
        : existing;
      if (this.isMediaType(type) && existing.media.length === 0) {
        try {
          await this.attachMedia(instance, storedMessage.id, data, type);
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          await this.db.message.update({
            where: { id: storedMessage.id },
            data: { payload: { ...storedPayload, mediaError: detail } as Prisma.InputJsonValue },
          });
          console.error(`[inbound-media] Falha ao armazenar ${type} ${providerMessageId}: ${detail}`);
        }
      }
      if (!text && CAPTION_MEDIA_TYPES.has(type)) await this.scheduleCaptionRepairs(storedMessage.id);
      return { conversationId: existing.conversationId };
    }
    const pushName = String(data.pushName || key.PushName || data.senderName || phone || 'Contato WhatsApp');
    const teamId = instance.teams[0]?.teamId;
    const knownConversation = await this.db.conversation.findFirst({
      where: { instanceId: instance.id, OR: [{ remoteJid }, { phoneJid: remoteJid }] },
      select: {
        id: true,
        status: true,
        assigneeId: true,
        lastMessageAt: true,
        contact: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    const phoneKey = normalizePhoneKey(phone);
    const phoneContact = !knownConversation && phoneKey
      ? await this.db.contact.findFirst({
        where: { organizationId: instance.organizationId, phoneKey, archivedAt: null },
        select: { id: true, name: true },
      })
      : null;
    // A LID is a provider address, not a telephone number. When it is received
    // from a message sent on the linked phone, preserve the CRM contact already
    // associated with the conversation instead of creating a fake LID contact.
    let ensuredContact = phoneContact || knownConversation?.contact;
    if (!ensuredContact) {
      try {
        ensuredContact = await this.db.contact.create({
          data: { organizationId: instance.organizationId, name: pushName, phone, phoneKey, source: 'WhatsApp recebido', teamId },
          select: { id: true, name: true },
        });
      } catch (error) {
        const uniqueRace = phoneKey && error && typeof error === 'object' && 'code' in error && error.code === 'P2002';
        if (!uniqueRace) throw error;
        const racedContact = await this.db.contact.findFirst({
          where: { organizationId: instance.organizationId, phoneKey, archivedAt: null },
          select: { id: true, name: true },
        });
        if (!racedContact) throw error;
        ensuredContact = racedContact;
      }
    }
    // Evolution can expose the same person as a phone JID on message upserts and
    // as a LID on delivery updates. Keep a single conversation for that contact
    // instead of creating one conversation for each provider address.
    const currentConversation = knownConversation || await this.db.conversation.findFirst({
      where: {
        instanceId: instance.id,
        contactId: ensuredContact.id,
      },
      select: { id: true, status: true, assigneeId: true, lastMessageAt: true },
      orderBy: { updatedAt: 'desc' },
    });
    const incomingRoute = currentConversation
      ? incomingConversationRoute(currentConversation.status, currentConversation.assigneeId)
      : incomingConversationRoute('WAITING', null);
    const conversation = currentConversation
      ? await this.db.conversation.update({
        where: { id: currentConversation.id },
        data: {
          contactId: ensuredContact.id,
          lastMessageAt: !currentConversation.lastMessageAt || occurredAt > currentConversation.lastMessageAt ? occurredAt : currentConversation.lastMessageAt,
          ...(!fromMe ? {
            status: incomingRoute.status,
            assigneeId: incomingRoute.assigneeId,
            closedAt: null,
            ...(incomingRoute.reopened ? { firstResponseAt: null } : {}),
            unreadCount: { increment: 1 },
          } : {}),
        },
        select: { id: true, assigneeId: true },
      })
      : await this.db.conversation.create({
        data: {
          organizationId: instance.organizationId, instanceId: instance.id, contactId: ensuredContact.id,
          remoteJid, phoneJid: remoteJid.includes('@s.whatsapp.net') ? remoteJid : null,
          status: incomingConversationStatus(null), unreadCount: fromMe ? 0 : 1, lastMessageAt: occurredAt,
        },
        select: { id: true, assigneeId: true },
      });
    if (!currentConversation) {
      await this.db.conversationEvent.create({ data: {
        organizationId: instance.organizationId,
        conversationId: conversation.id,
        type: 'started',
        text: fromMe ? 'Atendimento iniciado pelo WhatsApp conectado' : 'Atendimento iniciado por nova mensagem',
      } });
    } else if (!fromMe && currentConversation.status === 'CLOSED') {
      await this.db.conversationEvent.create({ data: {
        organizationId: instance.organizationId,
        conversationId: conversation.id,
        type: 'started',
        text: 'Novo atendimento iniciado por mensagem do cliente',
      } });
    }
    const resolvedReply = replyTarget?.conversationId === conversation.id ? replyTarget : null;
    const storedPayload = resolvedReply
      ? { ...data, replyToMessageId: resolvedReply.id, replyToProviderMessageId: replyProviderMessageId }
      : data;
    const storedMessage = await this.db.message.create({ data: {
      instanceId: instance.id, conversationId: conversation.id, providerMessageId,
      direction: fromMe ? 'OUTBOUND' : 'INBOUND', type, text, status: fromMe ? 'SENT' : 'DELIVERED',
      payload: storedPayload as Prisma.InputJsonValue, sentAt: occurredAt, deliveredAt: fromMe ? undefined : occurredAt, createdAt: occurredAt,
    } });
    if (this.isMediaType(type)) {
      try {
        await this.attachMedia(instance, storedMessage.id, data, type);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        await this.db.message.update({
          where: { id: storedMessage.id },
          data: { payload: { ...storedPayload, mediaError: detail } as Prisma.InputJsonValue },
        });
        console.error(`[inbound-media] Falha ao armazenar ${type} ${providerMessageId}: ${detail}`);
      }
    }
    if (!text && CAPTION_MEDIA_TYPES.has(type)) await this.scheduleCaptionRepairs(storedMessage.id);
    if (!fromMe) {
      const optOut = this.isOptOut(text);
      await this.db.$transaction(async (tx) => {
        if (optOut) {
          await tx.contact.update({ where: { id: ensuredContact.id }, data: { consentStatus: 'REVOKED', consentRevokedAt: new Date() } });
          await tx.consentEvent.create({ data: { contactId: ensuredContact.id, status: 'REVOKED', source: 'WhatsApp', evidence: text || 'Palavra de descadastro' } });
          await tx.suppression.upsert({ where: { contactId_channel: { contactId: ensuredContact.id, channel: 'WHATSAPP' } }, update: { reason: `Opt-out: ${text}` }, create: { contactId: ensuredContact.id, channel: 'WHATSAPP', reason: `Opt-out: ${text}` } });
        }
        await tx.campaignRecipient.updateMany({ where: { contactId: ensuredContact.id, status: { in: ['PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'READ'] } }, data: { status: optOut ? 'OPTED_OUT' : 'REPLIED', repliedAt: new Date(), exclusionReason: optOut ? 'Descadastro recebido' : null } });
        await tx.workflowEnrollment.updateMany({ where: { contactId: ensuredContact.id, status: { in: ['ACTIVE', 'WAITING'] } }, data: { status: 'STOPPED', stopReason: optOut ? 'Descadastro recebido' : 'Contato respondeu', completedAt: new Date() } });
        if (conversation.assigneeId) await tx.notification.create({ data: {
          organizationId: instance.organizationId, userId: conversation.assigneeId, type: 'conversation.message',
          title: `Nova mensagem de ${ensuredContact.name}`, body: text?.slice(0, 180), actionUrl: `/inbox/${conversation.id}`,
        } });
      });
      if (!optOut && !conversation.assigneeId) {
        await this.chatbotQueue?.add('process-chatbot-message', { messageId: storedMessage.id }, {
          jobId: `chatbot-inbound-${storedMessage.id}`, attempts: 5, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 1000,
        });
      }
    }
    return {
      conversationId: conversation.id,
      newMessage: {
        id: storedMessage.id,
        direction: fromMe ? 'OUTBOUND' : 'INBOUND',
        assigneeId: conversation.assigneeId,
      },
    };
  }

  private async applyReaction(instanceId: string, reaction: { targetProviderMessageId: string; emoji: string }, fromMe: boolean, actorName: string) {
    const target = await this.db.message.findUnique({
      where: { instanceId_providerMessageId: { instanceId, providerMessageId: reaction.targetProviderMessageId } },
    });
    if (!target) return;
    const payload = (target.payload || {}) as AnyObject;
    const current = Array.isArray(payload.reactions) ? payload.reactions as AnyObject[] : [];
    const source = fromMe ? 'me' : 'contact';
    const belongsToSource = (item: AnyObject) => item.source === source || (source === 'me' && !item.source && Boolean(item.userId));
    const previous = current.find(belongsToSource);
    const reactions = current.filter((item) => !belongsToSource(item));
    if (reaction.emoji) reactions.push({
      ...previous,
      emoji: reaction.emoji,
      source,
      userName: previous?.userName || actorName,
      updatedAt: new Date().toISOString(),
    });
    await this.db.message.update({
      where: { id: target.id },
      data: { payload: { ...payload, reactions } as Prisma.InputJsonValue },
    });
    return target.conversationId;
  }

  async repairStoredMedia(messageId: string) {
    const stored = await this.db.message.findUnique({ where: { id: messageId }, include: { instance: true, media: true } });
    if (!stored) return false;
    const payload = stored.payload as AnyObject;
    const content = payload.message || payload.Message || payload;
    const type = evolutionMessageType(content);
    if (!this.isMediaType(type)) return false;
    if (stored.type !== type) await this.db.message.update({ where: { id: stored.id }, data: { type } });
    if (stored.media.length > 0) return false;
    await this.attachMedia(stored.instance, stored.id, payload, type);
    return true;
  }

  private scheduleCaptionRepairs(messageId: string) {
    if (!this.inboundQueue) return Promise.resolve([]);
    return Promise.all([2_000, 8_000, 25_000, 90_000].map((delay) => this.inboundQueue!.add(
      'repair-media-caption',
      { messageId },
      {
        jobId: `caption-repair-${messageId}-${delay}`,
        delay,
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    )));
  }

  private findMessagesCached(instanceKey: string, remoteJid: string) {
    const now = Date.now();
    const cacheKey = `${instanceKey}:${remoteJid}`;
    const cached = this.targetedLookupCache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached.request;
    if (this.targetedLookupCache.size >= 500) {
      for (const [key, value] of this.targetedLookupCache) {
        if (value.expiresAt <= now) this.targetedLookupCache.delete(key);
      }
      if (this.targetedLookupCache.size >= 1000) {
        const oldestKey = this.targetedLookupCache.keys().next().value;
        if (oldestKey) this.targetedLookupCache.delete(oldestKey);
      }
    }
    const request = this.evolution.findMessages(instanceKey, remoteJid);
    this.targetedLookupCache.set(cacheKey, { expiresAt: now + TARGETED_LOOKUP_CACHE_MS, request });
    return request;
  }

  private cachedRecentMessages(instanceId: string, addresses: Set<string>) {
    const state = this.recentSyncState.get(instanceId);
    if (!state || Date.now() - state.fetchedAt > RECENT_MESSAGE_CACHE_MS) return [];
    return state.records.filter((record) => {
      const key = record.key || record.Info || record.info || {};
      const remoteJid = String(key.remoteJid || key.Chat || record.remoteJid || record.from || '');
      return addresses.has(remoteJid);
    });
  }

  async repairMediaCaption(messageId: string) {
    const stored = await this.db.message.findUnique({
      where: { id: messageId },
      include: { instance: true, conversation: true, media: true },
    });
    if (!stored || !stored.media.length || !['image', 'video', 'document'].includes(stored.type)) return;
    const payload = (stored.payload || {}) as AnyObject;
    if (payload.captionCompanionProviderMessageId || (stored.text && payload.recoveredCaption !== true)) return;
    const addresses = [...new Set([stored.conversation.remoteJid, stored.conversation.phoneJid].filter(Boolean))] as string[];
    const addressSet = new Set(addresses);
    let match = evolutionMediaCaptionCandidate(payload, this.cachedRecentMessages(stored.instanceId, addressSet));
    if (!match) {
      const candidateGroups = await Promise.all(addresses.map((remoteJid) => this.findMessagesCached(stored.instance.instanceKey, remoteJid)));
      match = evolutionMediaCaptionCandidate(payload, candidateGroups.flat());
    }
    if (!match?.text) return;
    if (evolutionCaptionRelation(payload, match.candidate) === 'companion') {
      const providerMessageId = String(match.candidate.key?.id || '');
      if (!providerMessageId) return;
      const type = evolutionMessageType(match.candidate.message || match.candidate.Message || match.candidate);
      const timestamp = Number(match.candidate.messageTimestamp || 0);
      const occurredAt = timestamp > 0 ? new Date(timestamp * 1000) : new Date(stored.createdAt.getTime() - 1);
      const companion = await this.db.message.upsert({
        where: { instanceId_providerMessageId: { instanceId: stored.instanceId, providerMessageId } },
        update: { text: match.text, payload: match.candidate as Prisma.InputJsonValue },
        create: {
          instanceId: stored.instanceId,
          conversationId: stored.conversationId,
          providerMessageId,
          direction: match.candidate.key?.fromMe ? 'OUTBOUND' : 'INBOUND',
          type,
          text: match.text,
          status: match.candidate.key?.fromMe ? 'SENT' : 'DELIVERED',
          payload: match.candidate as Prisma.InputJsonValue,
          sentAt: occurredAt,
          deliveredAt: match.candidate.key?.fromMe ? undefined : occurredAt,
          createdAt: occurredAt,
        },
        include: { media: true },
      });
      if (!companion.media.length) {
        try {
          await this.attachMedia(stored.instance, companion.id, match.candidate, type);
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          await this.db.message.update({ where: { id: companion.id }, data: { payload: { ...match.candidate, mediaError: detail } as Prisma.InputJsonValue } });
        }
      }
      const { recoveredCaption: _recoveredCaption, captionProviderMessageId: _captionProviderMessageId, captionRecoveredAt: _captionRecoveredAt, ...originalPayload } = payload;
      await this.db.message.update({
        where: { id: stored.id },
        data: {
          text: payload.recoveredCaption === true ? null : stored.text,
          payload: {
            ...originalPayload,
            captionCompanionProviderMessageId: providerMessageId,
            captionReconciledAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
      return { organizationId: stored.instance.organizationId, event: 'inbox.updated', payload: { conversationId: stored.conversationId } };
    }
    await this.db.message.update({
      where: { id: stored.id },
      data: {
        text: match.text,
        payload: {
          ...payload,
          recoveredCaption: true,
          captionProviderMessageId: String(match.candidate.key?.id || ''),
          captionRecoveredAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });
    return { organizationId: stored.instance.organizationId, event: 'inbox.updated', payload: { conversationId: stored.conversationId } };
  }

  private attachMedia(instance: { organizationId: string; instanceKey: string }, messageId: string, payload: AnyObject, type: string) {
    return mediaProcessing.run(() => this.attachMediaUnlocked(instance, messageId, payload, type));
  }

  private async attachMediaUnlocked(instance: { organizationId: string; instanceKey: string }, messageId: string, payload: AnyObject, type: string) {
    const result = await this.evolution.getMedia(instance.instanceKey, payload);
    const rawBase64 = result.base64.includes(',') ? result.base64.slice(result.base64.indexOf(',') + 1) : result.base64;
    const maximumBytes = 25 * 1024 * 1024;
    if (rawBase64.length > Math.ceil(maximumBytes / 3) * 4 + 4) throw new Error('A mídia recebida excede o limite de 25 MB');
    const body = Buffer.from(rawBase64, 'base64');
    if (!body.length) throw new Error('O arquivo recebido está vazio');
    if (body.length > maximumBytes) throw new Error('A mídia recebida excede o limite de 25 MB');
    const content = unwrapEvolutionMessage(payload.message || payload.Message || payload);
    const node = content[`${type}Message`] || {};
    const fallbackTypes: Record<string, string> = { sticker: 'image/webp', image: 'image/jpeg', audio: 'audio/ogg', video: 'video/mp4', document: 'application/octet-stream' };
    const contentType = String(result.mimetype || node.mimetype || fallbackTypes[type] || 'application/octet-stream');
    const fallbackExtensions: Record<string, string> = { sticker: 'webp', image: 'jpg', audio: 'ogg', video: 'mp4', document: 'bin' };
    const providerMessageId = String(payload.key?.id || payload.key?.ID || messageId);
    const filename = String(result.fileName || node.fileName || node.filename || `${providerMessageId}.${fallbackExtensions[type] || 'bin'}`);
    const key = await storeInboundMedia({ organizationId: instance.organizationId, filename, contentType, body });
    await this.db.mediaAsset.create({ data: { messageId, key, filename, contentType, sizeBytes: body.length } });
  }

  private async messageUpdate(instanceId: string, payload: AnyObject) {
    const data = Array.isArray(payload.data) ? payload.data[0] : payload.data || payload;
    const key = data.key || data;
    // MESSAGES_UPDATE in Evolution 2.3.x uses `keyId`; `messageId` is the
    // provider database row and does not match the WhatsApp message key.
    const providerMessageId = evolutionMessageUpdateId(data);
    if (!providerMessageId) return;
    const incomingStatus = evolutionMessageUpdateStatus(data);
    const message = await this.db.message.findUnique({
      where: { instanceId_providerMessageId: { instanceId, providerMessageId } },
    });
    if (!message) return;
    // Evolution can replay SERVER_ACK after DELIVERY_ACK/READ on reconnect.
    // Delivery state must stay monotonic; timestamps also recover rows that an
    // older worker had already downgraded.
    const currentStatus = message.readAt ? 'READ' : message.deliveredAt ? 'DELIVERED' : message.status;
    const status = advanceEvolutionMessageStatus(currentStatus, incomingStatus);
    const now = new Date();
    const providerJid = String(data.remoteJid || key.remoteJid || '');
    const deliveredAt = !message.deliveredAt && (incomingStatus === 'DELIVERED' || incomingStatus === 'READ') ? now : undefined;
    const readAt = !message.readAt && incomingStatus === 'READ' ? now : undefined;
    const needsMessageUpdate = message.status !== status || Boolean(deliveredAt) || Boolean(readAt);
    if (!needsMessageUpdate && !providerJid.includes('@lid')) return message.conversationId;
    await this.db.$transaction(async (tx) => {
      if (needsMessageUpdate) {
        await tx.message.update({ where: { id: message.id }, data: { status, deliveredAt, readAt } });
      }
      if (!providerJid.includes('@lid')) return;

      const lidJid = providerJid.replace(/:\d+@lid$/, '@lid');
      const conversation = await tx.conversation.findUnique({
        where: { id: message.conversationId },
        include: { contact: true },
      });
      if (!conversation) return;
      const phoneJid = conversation.phoneJid || (conversation.remoteJid.includes('@s.whatsapp.net') ? conversation.remoteJid : null);
      const duplicate = await tx.conversation.findFirst({
        where: { instanceId, remoteJid: lidJid, id: { not: conversation.id } },
        include: { contact: true },
      });

      if (duplicate) {
        await tx.message.updateMany({ where: { conversationId: duplicate.id }, data: { conversationId: conversation.id } });
        await tx.conversationEvent.updateMany({ where: { conversationId: duplicate.id }, data: { conversationId: conversation.id } });
        await tx.conversation.delete({ where: { id: duplicate.id } });
        if (duplicate.contact.phone === `+${lidJid.split('@')[0]}` && duplicate.contact.id !== conversation.contactId) {
          await tx.contact.update({ where: { id: duplicate.contact.id }, data: { archivedAt: new Date() } });
        }
      }

      await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          remoteJid: lidJid,
          phoneJid,
          unreadCount: duplicate ? conversation.unreadCount + duplicate.unreadCount : undefined,
          lastMessageAt: duplicate && duplicate.lastMessageAt && (!conversation.lastMessageAt || duplicate.lastMessageAt > conversation.lastMessageAt)
            ? duplicate.lastMessageAt
            : undefined,
        },
      });
    });
    return message.conversationId;
  }

  private async secretMessageEdited(
    instance: { id: string; instanceKey: string },
    data: AnyObject,
    envelope: SecretEditEnvelope,
    occurredAt: Date,
  ) {
    const original = await this.db.message.findUnique({
      where: {
        instanceId_providerMessageId: {
          instanceId: instance.id,
          providerMessageId: envelope.targetProviderMessageId,
        },
      },
      include: { conversation: { select: { remoteJid: true, phoneJid: true } } },
    });
    if (!original) throw new Error(`Mensagem original da edição não encontrada: ${envelope.targetProviderMessageId}`);
    const originalPayload = (original.payload || {}) as AnyObject;
    let decoded = decryptEvolutionSecretEdit(data, originalPayload, original.conversation);
    if (!decoded) {
      const raw = await this.evolution.findMessage(instance.instanceKey, envelope.providerMessageId);
      if (raw) decoded = decryptEvolutionSecretEdit(raw, originalPayload, data, original.conversation);
    }
    if (!decoded) {
      console.error(`[evolution-edit] Não foi possível decodificar a edição ${envelope.providerMessageId} de ${envelope.targetProviderMessageId}.`);
      return original.conversationId;
    }
    return this.applyMessageEdit(instance.id, decoded, occurredAt, data);
  }

  private async messageEdited(instanceId: string, payload: AnyObject) {
    const decoded = evolutionEditedMessage(payload);
    if (!decoded) return;
    const data = Array.isArray(payload.data) ? payload.data[0] : payload.data || payload;
    const occurredAt = evolutionMessageDate(data);
    const editHash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
    const editIdentity = `messages.edited:${decoded.targetProviderMessageId}:${editHash}`;
    return this.applyMessageEdit(instanceId, { ...decoded, providerMessageId: editIdentity }, occurredAt, data);
  }

  private async applyMessageEdit(instanceId: string, edit: DecodedMessageEdit, occurredAt: Date, providerPayload: AnyObject) {
    const original = await this.db.message.findUnique({
      where: {
        instanceId_providerMessageId: {
          instanceId,
          providerMessageId: edit.targetProviderMessageId,
        },
      },
      include: { conversation: { select: { unreadCount: true } } },
    });
    if (!original) throw new Error(`Mensagem original da edição não encontrada: ${edit.targetProviderMessageId}`);
    const editIdentity = edit.providerMessageId || `${edit.targetProviderMessageId}:${occurredAt.toISOString()}:${edit.text}`;
    const payload = editedMessagePayload(original, edit.text, occurredAt.toISOString(), editIdentity);
    const controlMessageId = edit.providerMessageId && !edit.providerMessageId.startsWith('messages.edited:')
      ? edit.providerMessageId
      : null;
    await this.db.$transaction(async (tx) => {
      const controlMessage = controlMessageId && controlMessageId !== edit.targetProviderMessageId
        ? await tx.message.findFirst({
          where: { instanceId, providerMessageId: controlMessageId, id: { not: original.id } },
          select: { id: true, direction: true },
        })
        : null;
      const removed = controlMessage
        ? await tx.message.deleteMany({ where: { id: controlMessage.id } })
        : { count: 0 };
      if (payload) {
        await tx.message.update({
          where: { id: original.id },
          data: {
            text: edit.text,
            payload: {
              ...payload,
              providerEdit: providerPayload,
            } as Prisma.InputJsonValue,
          },
        });
      }
      if (removed.count > 0) {
        const latest = await tx.message.findFirst({
          where: { conversationId: original.conversationId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { createdAt: true },
        });
        await tx.conversation.update({
          where: { id: original.conversationId },
          data: {
            unreadCount: Math.max(
              0,
              original.conversation.unreadCount - (controlMessage?.direction === 'INBOUND' ? removed.count : 0),
            ),
            lastMessageAt: latest?.createdAt || original.createdAt,
          },
        });
      }
    });
    return original.conversationId;
  }

  private async touchInstanceEvent(instanceId: string) {
    const now = Date.now();
    if (now - (this.lastInstanceEventWriteAt.get(instanceId) || 0) < INSTANCE_EVENT_TOUCH_INTERVAL_MS) return;
    this.lastInstanceEventWriteAt.set(instanceId, now);
    try {
      await this.db.whatsappInstance.update({ where: { id: instanceId }, data: { lastEventAt: new Date(now) } });
    } catch (error) {
      this.lastInstanceEventWriteAt.delete(instanceId);
      throw error;
    }
  }

  private async messageDelete(instanceId: string, payload: AnyObject) {
    const data = Array.isArray(payload.data) ? payload.data : [payload.data || payload];
    const ids = data.map((item) => String(item?.key?.id || item?.id || '')).filter(Boolean);
    if (!ids.length) return;
    const messages = await this.db.message.findMany({ where: { instanceId, providerMessageId: { in: ids } } });
    const deletedAt = new Date().toISOString();
    await this.db.$transaction(messages.map((message) => this.db.message.update({
      where: { id: message.id },
      data: { payload: deletedMessagePayload(message, deletedAt) as Prisma.InputJsonValue },
    })));
    const conversationIds = new Set(messages.map((message) => message.conversationId));
    return conversationIds.size === 1 ? messages[0]?.conversationId : undefined;
  }

  private extractText(message: AnyObject): string | null {
    return evolutionMessageText(message);
  }

  private extractType(message: AnyObject) {
    return evolutionMessageType(message);
  }

  private isMediaType(type: string) {
    return MEDIA_TYPES.has(type);
  }

  private isOptOut(text: string | null) {
    return isOptOutMessage(text);
  }
}
