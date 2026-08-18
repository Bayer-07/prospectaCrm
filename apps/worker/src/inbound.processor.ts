import type { Job, Queue } from 'bullmq';
import { Prisma, PrismaClient, type MessageStatus } from '@prisma/client';
import { extractSharedWhatsappContacts, isOptOutMessage, normalizeEvolutionInstanceStatus, normalizePhoneKey, type FollowUpAlertEmailJob } from '@prospecta/contracts';
import { createDecipheriv, createHash, hkdfSync } from 'node:crypto';
import { EvolutionClient } from './evolution-client.js';
import { storeInboundMedia } from './storage.js';

type AnyObject = Record<string, any>;
type StoredMessageResult = {
  conversationId: string;
  tasksUpdated?: boolean;
  newMessage?: {
    id: string;
    direction: 'INBOUND' | 'OUTBOUND';
    assigneeId: string | null;
  };
};
type ProcessedInboundEvent = Partial<StoredMessageResult>;
type HandledMessage =
  | { handled: false }
  | { handled: true; result: StoredMessageResult | undefined };

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
type InboundInstance = Omit<SyncInstance, 'connectedAt'>;

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
  if (rawStatus.includes('READ')) return 'READ';
  if (rawStatus.includes('DELIVER')) return 'DELIVERED';
  if (rawStatus.includes('ERROR') || rawStatus.includes('FAIL')) return 'FAILED';
  return 'SENT';
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
const storedMessageDeliveryStatus = (message: { status: MessageStatus; deliveredAt: Date | null; readAt: Date | null }) => {
  if (message.readAt) return 'READ';
  if (message.deliveredAt) return 'DELIVERED';
  return message.status;
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
    || content.locationMessage?.contextInfo
    || content.liveLocationMessage?.contextInfo
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
    || message.locationMessage?.name
    || message.locationMessage?.address
    || message.liveLocationMessage?.caption
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
  if (message.locationMessage || message.liveLocationMessage) return 'location';
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
  return ['sticker', 'image', 'audio', 'video', 'document', 'contact', 'location'].includes(type);
};

const mediaNode = (record: AnyObject, type: string) => {
  const content = unwrapEvolutionMessage(record.message || record.Message || record);
  return content[`${type}Message`] || {};
};

const serializedValue = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (value && typeof value === 'object') return JSON.stringify(value) ?? '';
  return '';
};

const isUniqueContactRace = (error: unknown, phoneKey: string | null) => {
  if (!phoneKey || !error || typeof error !== 'object') return false;
  return 'code' in error && error.code === 'P2002';
};

const normalizedFilename = (value: unknown) => serializedValue(value).normalize('NFC').toLocaleLowerCase('pt-BR');
const mediaSha = (value: unknown) => serializedValue(value);

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

type ProtobufField = { field: number; wire: number; bytes?: Buffer; value?: bigint };
type ProtobufCursor = { offset: number };

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

const readProtobufVarint = (input: Buffer, cursor: ProtobufCursor) => {
  let value = 0n;
  let shift = 0n;
  for (let count = 0; count < 10 && cursor.offset < input.length; count += 1) {
    const byte = input[cursor.offset++];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return value;
    shift += 7n;
  }
  throw new Error('Protobuf inválido');
};

const readProtobufField = (input: Buffer, cursor: ProtobufCursor): ProtobufField => {
  const tag = readProtobufVarint(input, cursor);
  const field = Number(tag >> 3n);
  const wire = Number(tag & 7n);
  if (!field) throw new Error('Campo protobuf inválido');
  if (wire === 0) return { field, wire, value: readProtobufVarint(input, cursor) };
  let fixedLength = 0;
  if (wire === 1) fixedLength = 8;
  else if (wire === 5) fixedLength = 4;
  if (fixedLength) {
    if (cursor.offset + fixedLength > input.length) throw new Error('Protobuf truncado');
    cursor.offset += fixedLength;
    return { field, wire };
  }
  if (wire !== 2) throw new Error(`Wire type protobuf não suportado: ${wire}`);
  const length = Number(readProtobufVarint(input, cursor));
  if (!Number.isSafeInteger(length) || length < 0 || cursor.offset + length > input.length) throw new Error('Protobuf truncado');
  const bytes = input.subarray(cursor.offset, cursor.offset + length);
  cursor.offset += length;
  return { field, wire, bytes };
};

const protobufFields = (input: Buffer) => {
  const fields: ProtobufField[] = [];
  const cursor = { offset: 0 };
  while (cursor.offset < input.length) fields.push(readProtobufField(input, cursor));
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
  const jid = serializedValue(value).trim();
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

  constructor(
    private readonly db: PrismaClient,
    private readonly chatbotQueue?: Queue,
    private readonly evolution = new EvolutionClient(),
    private readonly inboundQueue?: Queue,
    private readonly transactionalEmailQueue?: Queue,
  ) {}

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
      const { conversationId, newMessage, tasksUpdated } = await this.dispatchEvent(instance, payload, eventType);
      await this.db.inboundWebhookEvent.update({ where: { id: event.id }, data: { status: 'processed', processedAt: new Date() } });
      return {
        organizationId: instance.organizationId,
        event: eventType.includes('CONNECTION') ? 'whatsapp.updated' : 'inbox.updated',
        payload: { instanceId: instance.id, ...(conversationId ? { conversationId } : {}), ...(newMessage ? { newMessage } : {}), ...(tasksUpdated ? { tasksUpdated: true } : {}) },
      };
    } catch (error) {
      await this.db.inboundWebhookEvent.update({ where: { id: event.id }, data: { status: 'failed', error: error instanceof Error ? error.message : String(error) } });
      throw error;
    }
  }

  private async dispatchEvent(instance: SyncInstance, payload: AnyObject, eventType: string): Promise<ProcessedInboundEvent> {
    if (eventType.includes('CONNECTION')) {
      await this.connection(instance.id, payload);
      return {};
    }
    if (eventType.includes('MESSAGES_UPSERT') || eventType === 'MESSAGE' || eventType.includes('SEND_MESSAGE')) {
      return await this.message(instance, payload) || {};
    }
    if (eventType.includes('MESSAGES_EDITED')) return { conversationId: await this.messageEdited(instance.id, payload) };
    if (eventType.includes('MESSAGES_UPDATE')) return { conversationId: await this.messageUpdate(instance.id, payload) };
    if (eventType.includes('MESSAGES_DELETE')) return { conversationId: await this.messageDelete(instance.id, payload) };
    return {};
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
      const event = await this.syncRecentInstance(instance, now, windowMs);
      if (event) events.push(event);
    }
    return events;
  }

  private recentState(instanceId: string) {
    const existing = this.recentSyncState.get(instanceId);
    if (existing) return existing;
    const state: RecentSyncState = {
      nextAt: 0,
      delayMs: RECENT_SYNC_BASE_DELAY_MS,
      fingerprint: '',
      fetchedAt: 0,
      records: [],
    };
    this.recentSyncState.set(instanceId, state);
    return state;
  }

  private async syncRecentInstance(instance: SyncInstance, now: number, windowMs: number) {
    const state = this.recentState(instance.id);
    if (state.nextAt > now) return;
    try {
      const connectedAt = instance.connectedAt?.getTime() || 0;
      const since = new Date(Math.max(now - windowMs, connectedAt));
      const recent = (await this.evolution.findMessages(instance.instanceKey, undefined, 50))
        .filter((record) => isSynchronizableEvolutionMessage(record, since))
        .sort((left, right) => evolutionMessageDate(left, new Date(0)).getTime() - evolutionMessageDate(right, new Date(0)).getTime());
      const fingerprint = evolutionMessagesFingerprint(recent);
      const changed = fingerprint !== state.fingerprint;
      this.updateRecentState(state, recent, changed, now);
      if (!changed) return;
      if (!recent.length) {
        state.fingerprint = fingerprint;
        return;
      }
      const imported = await this.importRecentMessages(instance, recent);
      state.fingerprint = fingerprint;
      if (!imported) return;
      await this.db.whatsappInstance.update({ where: { id: instance.id }, data: { lastEventAt: new Date() } });
      console.log(`[evolution-sync] ${imported} mensagem(ns) recente(s) importada(s) de ${instance.instanceKey}.`);
      return { organizationId: instance.organizationId, event: 'inbox.updated' as const, payload: { instanceId: instance.id } };
    } catch (error) {
      state.delayMs = nextEvolutionSyncDelay(state.delayMs, false, true);
      state.nextAt = now + state.delayMs;
      console.error(`[evolution-sync] Falha ao sincronizar ${instance.instanceKey}:`, error instanceof Error ? error.message : error);
      return;
    }
  }

  private updateRecentState(state: RecentSyncState, recent: AnyObject[], changed: boolean, now: number) {
    state.records = recent;
    state.fetchedAt = now;
    state.delayMs = nextEvolutionSyncDelay(state.delayMs, changed);
    state.nextAt = now + state.delayMs;
  }

  private async importRecentMessages(instance: SyncInstance, recent: AnyObject[]) {
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
        const duplicated = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
        if (!duplicated) throw error;
      }
    }
    return imported;
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
    const data = this.messageData(payload);
    const occurredAt = evolutionMessageDate(data);
    const secretEdit = await this.handleSecretEdit(instance, data, occurredAt);
    if (secretEdit.handled) return secretEdit.result;
    const identity = this.messageIdentity(data);
    if (!identity) return;
    const { key, remoteJid, providerMessageId, fromMe } = identity;
    const reaction = await this.handleReaction(instance.id, data, key, fromMe);
    if (reaction.handled) return reaction.result;
    const { phone, text, type, replyProviderMessageId } = this.messageContent(data, remoteJid);
    const [existing, replyTarget] = await this.relatedMessages(instance.id, providerMessageId, replyProviderMessageId);
    if (existing) return this.reconcileExistingMessage({
      existing,
      replyTarget,
      type,
      text,
      data,
      replyProviderMessageId,
      instance,
      providerMessageId,
    });
    const pushName = String(data.pushName || key.PushName || data.senderName || phone || 'Contato WhatsApp');
    const teamId = instance.teams[0]?.teamId;
    const { ensuredContact, knownConversation } = await this.resolveInboundContact(instance, remoteJid, phone, pushName, teamId);
    const conversation = await this.upsertInboundConversation({
      instance,
      ensuredContact,
      knownConversation,
      remoteJid,
      occurredAt,
      fromMe,
    });
    const storedMessage = await this.storeInboundMessage({
      instance,
      conversation,
      providerMessageId,
      fromMe,
      type,
      text,
      data,
      replyTarget,
      replyProviderMessageId,
      occurredAt,
    });
    const tasksUpdated = !fromMe
      ? await this.handleInboundEffects(instance, conversation, ensuredContact, storedMessage.id, text)
      : false;
    return {
      conversationId: conversation.id,
      tasksUpdated,
      newMessage: {
        id: storedMessage.id,
        direction: fromMe ? 'OUTBOUND' : 'INBOUND',
        assigneeId: conversation.assigneeId,
      },
    };
  }

  private messageData(payload: AnyObject): AnyObject {
    if (Array.isArray(payload.data)) return payload.data[0] || {};
    return payload.data || payload;
  }

  private async handleSecretEdit(instance: InboundInstance, data: AnyObject, occurredAt: Date): Promise<HandledMessage> {
    const secretEdit = evolutionSecretEditEnvelope(data);
    if (!secretEdit) return { handled: false };
    const conversationId = await this.secretMessageEdited(instance, data, secretEdit, occurredAt);
    const result = conversationId ? { conversationId } : undefined;
    return { handled: true, result };
  }

  private messageIdentity(data: AnyObject) {
    const key = data.key || data.Info || data.info || {};
    const remoteJid = String(key.remoteJid || key.Chat || data.remoteJid || data.from || '');
    if (!remoteJid || remoteJid.includes('@g.us')) return null;
    const providerMessageId = String(key.id || key.ID || data.id || '');
    if (!providerMessageId) return null;
    const fromMe = Boolean(key.fromMe ?? key.IsFromMe ?? data.fromMe);
    return { key, remoteJid, providerMessageId, fromMe };
  }

  private async handleReaction(instanceId: string, data: AnyObject, key: AnyObject, fromMe: boolean): Promise<HandledMessage> {
    const reaction = evolutionReaction(data);
    if (!reaction) return { handled: false };
    const fallbackName = fromMe ? 'WhatsApp conectado' : 'Contato';
    const actorName = String(data.pushName || key.PushName || data.senderName || fallbackName);
    const conversationId = await this.applyReaction(instanceId, reaction, fromMe, actorName);
    const result = conversationId ? { conversationId } : undefined;
    return { handled: true, result };
  }

  private messageContent(data: AnyObject, remoteJid: string) {
    const phoneDigits = remoteJid.includes('@s.whatsapp.net') ? remoteJid.split('@')[0].split(':')[0].replace(/\D/g, '') : '';
    const phone = phoneDigits ? `+${phoneDigits}` : undefined;
    const content = data.message || data.Message || data;
    return {
      phone,
      text: this.extractText(content),
      type: this.extractType(content),
      replyProviderMessageId: evolutionReplyProviderMessageId(data),
    };
  }

  private relatedMessages(instanceId: string, providerMessageId: string, replyProviderMessageId: string | null) {
    return Promise.all([
      this.db.message.findUnique({
        where: { instanceId_providerMessageId: { instanceId, providerMessageId } },
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
          where: { instanceId_providerMessageId: { instanceId, providerMessageId: replyProviderMessageId } },
          select: { id: true, conversationId: true },
        })
        : null,
    ]);
  }

  private async reconcileExistingMessage(context: AnyObject): Promise<StoredMessageResult> {
    const { existing, replyTarget, type, text, data, replyProviderMessageId, instance, providerMessageId } = context;
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
      await this.attachMediaSafely(instance, storedMessage.id, data, type, storedPayload, providerMessageId);
    }
    if (!text && CAPTION_MEDIA_TYPES.has(type)) await this.scheduleCaptionRepairs(storedMessage.id);
    return { conversationId: existing.conversationId };
  }

  private async resolveInboundContact(
    instance: InboundInstance,
    remoteJid: string,
    phone: string | undefined,
    pushName: string,
    teamId: string | undefined,
  ) {
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
    const existingContact = phoneContact || knownConversation?.contact;
    if (existingContact) return { ensuredContact: existingContact, knownConversation };
    const ensuredContact = await this.createInboundContact(instance, phone, phoneKey, pushName, teamId);
    return { ensuredContact, knownConversation };
  }

  private async createInboundContact(
    instance: InboundInstance,
    phone: string | undefined,
    phoneKey: string | null,
    pushName: string,
    teamId: string | undefined,
  ) {
    try {
      return await this.db.contact.create({
        data: { organizationId: instance.organizationId, name: pushName, phone, phoneKey, source: 'WhatsApp recebido', teamId },
        select: { id: true, name: true },
      });
    } catch (error) {
      if (!isUniqueContactRace(error, phoneKey)) throw error;
      const racedContact = await this.db.contact.findFirst({
        where: { organizationId: instance.organizationId, phoneKey, archivedAt: null },
        select: { id: true, name: true },
      });
      if (!racedContact) throw error;
      return racedContact;
    }
  }

  private async upsertInboundConversation(context: AnyObject) {
    const { instance, ensuredContact, knownConversation } = context;
    const currentConversation = knownConversation || await this.db.conversation.findFirst({
      where: { instanceId: instance.id, contactId: ensuredContact.id },
      select: { id: true, status: true, assigneeId: true, lastMessageAt: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (currentConversation) return this.updateInboundConversation(context, currentConversation);
    return this.createInboundConversation(context);
  }

  private async updateInboundConversation(context: AnyObject, currentConversation: AnyObject) {
    const { instance, ensuredContact, occurredAt, fromMe } = context;
    const incomingRoute = incomingConversationRoute(currentConversation.status, currentConversation.assigneeId);
    const conversation = await this.db.conversation.update({
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
    });
    if (!fromMe && currentConversation.status === 'CLOSED') {
      await this.createConversationStartEvent(instance.organizationId, conversation.id, occurredAt, 'Novo atendimento iniciado por mensagem do cliente');
    }
    return conversation;
  }

  private async createInboundConversation(context: AnyObject) {
    const { instance, ensuredContact, remoteJid, occurredAt, fromMe } = context;
    const conversation = await this.db.conversation.create({
      data: {
        organizationId: instance.organizationId,
        instanceId: instance.id,
        contactId: ensuredContact.id,
        remoteJid,
        phoneJid: remoteJid.includes('@s.whatsapp.net') ? remoteJid : null,
        status: incomingConversationStatus(null),
        unreadCount: fromMe ? 0 : 1,
        lastMessageAt: occurredAt,
      },
      select: { id: true, assigneeId: true },
    });
    const eventText = fromMe ? 'Atendimento iniciado pelo WhatsApp conectado' : 'Atendimento iniciado por nova mensagem';
    await this.createConversationStartEvent(instance.organizationId, conversation.id, occurredAt, eventText);
    return conversation;
  }

  private createConversationStartEvent(organizationId: string, conversationId: string, createdAt: Date, text: string) {
    return this.db.conversationEvent.create({ data: { organizationId, conversationId, type: 'started', text, createdAt } });
  }

  private async storeInboundMessage(context: AnyObject) {
    const {
      instance, conversation, providerMessageId, fromMe, type, text, data,
      replyTarget, replyProviderMessageId, occurredAt,
    } = context;
    const resolvedReply = replyTarget?.conversationId === conversation.id ? replyTarget : null;
    const storedPayload = resolvedReply
      ? { ...data, replyToMessageId: resolvedReply.id, replyToProviderMessageId: replyProviderMessageId }
      : data;
    const storedMessage = await this.db.message.create({ data: {
      instanceId: instance.id,
      conversationId: conversation.id,
      providerMessageId,
      direction: fromMe ? 'OUTBOUND' : 'INBOUND',
      type,
      text,
      status: fromMe ? 'SENT' : 'DELIVERED',
      payload: storedPayload as Prisma.InputJsonValue,
      sentAt: occurredAt,
      deliveredAt: fromMe ? undefined : occurredAt,
      createdAt: occurredAt,
    } });
    if (this.isMediaType(type)) {
      await this.attachMediaSafely(instance, storedMessage.id, data, type, storedPayload, providerMessageId);
    }
    if (!text && CAPTION_MEDIA_TYPES.has(type)) await this.scheduleCaptionRepairs(storedMessage.id);
    return storedMessage;
  }

  private async attachMediaSafely(
    instance: InboundInstance,
    messageId: string,
    data: AnyObject,
    type: string,
    storedPayload: AnyObject,
    providerMessageId: string,
  ) {
    try {
      await this.attachMedia(instance, messageId, data, type);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await this.db.message.update({
        where: { id: messageId },
        data: { payload: { ...storedPayload, mediaError: detail } as Prisma.InputJsonValue },
      });
      console.error(`[inbound-media] Falha ao armazenar ${type} ${providerMessageId}: ${detail}`);
    }
  }

  private async handleInboundEffects(
    instance: InboundInstance,
    conversation: { id: string; assigneeId: string | null },
    contact: { id: string; name: string },
    messageId: string,
    text: string | null,
  ) {
    const optOut = this.isOptOut(text);
    const followUpResult = await this.db.$transaction(async (tx) => {
      if (optOut) {
        await tx.contact.update({ where: { id: contact.id }, data: { consentStatus: 'REVOKED', consentRevokedAt: new Date() } });
        await tx.consentEvent.create({ data: { contactId: contact.id, status: 'REVOKED', source: 'WhatsApp', evidence: text || 'Palavra de descadastro' } });
        await tx.suppression.upsert({ where: { contactId_channel: { contactId: contact.id, channel: 'WHATSAPP' } }, update: { reason: `Opt-out: ${text}` }, create: { contactId: contact.id, channel: 'WHATSAPP', reason: `Opt-out: ${text}` } });
      }
      await tx.campaignRecipient.updateMany({ where: { contactId: contact.id, status: { in: ['PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'READ'] } }, data: { status: optOut ? 'OPTED_OUT' : 'REPLIED', repliedAt: new Date(), exclusionReason: optOut ? 'Descadastro recebido' : null } });
      await tx.conversationAiGeneration.updateMany({
        where: { conversationId: conversation.id, type: 'SUMMARY', status: 'COMPLETED' },
        data: { status: 'STALE' },
      });
      await tx.workflowEnrollment.updateMany({ where: { contactId: contact.id, status: { in: ['ACTIVE', 'WAITING'] } }, data: { status: 'STOPPED', stopReason: optOut ? 'Descadastro recebido' : 'Contato respondeu', completedAt: new Date() } });
      const followUp = await this.interruptFollowUpByReply(tx, instance, conversation.id, contact.name, messageId);
      if (conversation.assigneeId) await tx.notification.create({ data: {
        organizationId: instance.organizationId,
        userId: conversation.assigneeId,
        type: 'conversation.message',
        title: `Nova mensagem de ${contact.name}`,
        body: text?.slice(0, 180),
        actionUrl: `/inbox/${conversation.id}`,
      } });
      return {
        alertId: followUp?.emailResponsible ? followUp.id : null,
        changed: Boolean(followUp),
      };
    });
    if (followUpResult.alertId && this.transactionalEmailQueue) {
      const data: FollowUpAlertEmailJob = { followUpId: followUpResult.alertId, reason: 'contact_replied_before_start' };
      await this.transactionalEmailQueue.add('send-follow-up-alert', data, {
        jobId: `follow-up-alert-${followUpResult.alertId}-reply`,
        attempts: 6,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: 1_000,
      });
    }
    if (!optOut && !conversation.assigneeId) {
      await this.chatbotQueue?.add('process-chatbot-message', { messageId }, {
        jobId: `chatbot-inbound-${messageId}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 1000,
      });
    }
    return followUpResult.changed;
  }

  private async interruptFollowUpByReply(
    tx: Prisma.TransactionClient,
    instance: InboundInstance,
    conversationId: string,
    contactName: string,
    messageId: string,
  ) {
    const active = await tx.conversationFollowUp.findFirst({
      where: { conversationId, status: { in: ['SCHEDULED', 'RUNNING'] } },
      select: { id: true, status: true, taskId: true, responsibleId: true },
    });
    if (!active) return null;
    const beforeStart = active.status === 'SCHEDULED';
    const now = new Date();
    await tx.conversationFollowUp.update({
      where: { id: active.id },
      data: beforeStart
        ? { status: 'CANCELLED', cancelledAt: now, cancellationReason: 'Contato respondeu antes do início' }
        : { status: 'INTERRUPTED', completedAt: now, cancellationReason: 'Contato respondeu durante a sequência' },
    });
    await tx.conversationFollowUpStep.updateMany({
      where: { followUpId: active.id, status: { in: ['PENDING', 'QUEUED'] } },
      data: { status: 'CANCELLED' },
    });
    await tx.message.updateMany({
      where: { followUpStep: { followUpId: active.id }, status: 'QUEUED' },
      data: { status: 'SKIPPED' },
    });
    await tx.task.update({
      where: { id: active.taskId },
      data: beforeStart
        ? { status: 'CANCELLED', completedAt: null }
        : { status: 'COMPLETED', completedAt: now },
    });
    await tx.conversationEvent.create({ data: {
      organizationId: instance.organizationId,
      conversationId,
      type: beforeStart ? 'follow_up_cancelled_by_reply' : 'follow_up_interrupted_by_reply',
      text: beforeStart
        ? 'O follow-up automático foi cancelado porque o contato respondeu antes do envio'
        : 'As mensagens restantes do follow-up foram canceladas porque o contato respondeu',
      metadata: { followUpId: active.id, messageId },
    } });
    await tx.notification.create({ data: {
      organizationId: instance.organizationId,
      userId: active.responsibleId,
      type: beforeStart ? 'follow_up.cancelled_by_reply' : 'follow_up.interrupted_by_reply',
      title: beforeStart ? `Follow-up cancelado: ${contactName}` : `Follow-up interrompido: ${contactName}`,
      body: beforeStart ? 'O contato respondeu antes do horário agendado.' : 'O contato respondeu durante a sequência.',
      actionUrl: `/inbox/${conversationId}`,
    } });
    return { id: active.id, emailResponsible: beforeStart };
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
    if (!stored?.media.length || !['image', 'video', 'document'].includes(stored.type)) return;
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
      return this.repairCompanionCaption(stored, payload, match);
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

  private async repairCompanionCaption(stored: AnyObject, payload: AnyObject, match: { candidate: AnyObject; text: string | null }) {
    const providerMessageId = String(match.candidate.key?.id || '');
    if (!providerMessageId || !match.text) return;
    const type = evolutionMessageType(match.candidate.message || match.candidate.Message || match.candidate);
    const timestamp = Number(match.candidate.messageTimestamp || 0);
    const occurredAt = timestamp > 0 ? new Date(timestamp * 1000) : new Date(stored.createdAt.getTime() - 1);
    const fromMe = Boolean(match.candidate.key?.fromMe);
    const companion = await this.db.message.upsert({
      where: { instanceId_providerMessageId: { instanceId: stored.instanceId, providerMessageId } },
      update: { text: match.text, payload: match.candidate as Prisma.InputJsonValue },
      create: {
        instanceId: stored.instanceId,
        conversationId: stored.conversationId,
        providerMessageId,
        direction: fromMe ? 'OUTBOUND' : 'INBOUND',
        type,
        text: match.text,
        status: fromMe ? 'SENT' : 'DELIVERED',
        payload: match.candidate as Prisma.InputJsonValue,
        sentAt: occurredAt,
        deliveredAt: fromMe ? undefined : occurredAt,
        createdAt: occurredAt,
      },
      include: { media: true },
    });
    await this.attachCompanionMedia(stored, companion, match.candidate, type);
    await this.markCaptionCompanion(stored, payload, providerMessageId);
    return { organizationId: stored.instance.organizationId, event: 'inbox.updated', payload: { conversationId: stored.conversationId } };
  }

  private async attachCompanionMedia(stored: AnyObject, companion: AnyObject, candidate: AnyObject, type: string) {
    if (companion.media.length) return;
    try {
      await this.attachMedia(stored.instance, companion.id, candidate, type);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await this.db.message.update({ where: { id: companion.id }, data: { payload: { ...candidate, mediaError: detail } as Prisma.InputJsonValue } });
    }
  }

  private async markCaptionCompanion(stored: AnyObject, payload: AnyObject, providerMessageId: string) {
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
    const currentStatus = storedMessageDeliveryStatus(message);
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
          lastMessageAt: duplicate?.lastMessageAt && (!conversation.lastMessageAt || duplicate.lastMessageAt > conversation.lastMessageAt)
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
