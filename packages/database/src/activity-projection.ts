import {
  ActivityOrigin,
  ActivityStatus,
  MessageStatus,
  Prisma,
} from '@prisma/client';

type ActivityDatabase = Pick<Prisma.TransactionClient, 'activity' | 'campaign' | 'campaignRecipient' | 'message' | 'note' | 'task'>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function uuidValue(value: unknown) {
  const normalized = typeof value === 'string' ? value : '';
  return UUID.test(normalized) ? normalized : null;
}

export function messageActivityStatus(status: MessageStatus): ActivityStatus {
  if (status === 'READ') return ActivityStatus.READ;
  if (status === 'DELIVERED') return ActivityStatus.DELIVERED;
  if (status === 'REPLIED') return ActivityStatus.REPLIED;
  if (status === 'FAILED') return ActivityStatus.FAILED;
  return ActivityStatus.SENT;
}

export async function projectWhatsappMessageActivity(db: ActivityDatabase, messageId: string) {
  const message = await db.message.findUnique({
    where: { id: messageId },
    include: {
      conversation: {
        select: {
          organizationId: true,
          teamId: true,
          contactId: true,
          contact: {
            select: {
              companies: { where: { isPrimary: true }, select: { companyId: true }, take: 1 },
            },
          },
        },
      },
    },
  });
  if (!message || message.direction !== 'OUTBOUND' || !message.sentAt) return null;
  const payload = objectValue(message.payload);
  const generatedByBzs = ['authorId', 'campaignId', 'followUpId', 'enrollmentId', 'automated', 'aiGenerationId']
    .some((key) => Object.hasOwn(payload, key));
  if (!generatedByBzs) return null;

  const campaignId = uuidValue(payload.campaignId);
  const campaign = campaignId ? await db.campaign.findUnique({ where: { id: campaignId }, select: { createdById: true } }) : null;
  const origin = campaignId
    ? ActivityOrigin.CAMPAIGN
    : ['followUpId', 'enrollmentId', 'automated', 'aiGenerationId'].some((key) => Object.hasOwn(payload, key))
      ? ActivityOrigin.AUTOMATION
      : ActivityOrigin.INBOX;
  const data = {
    organizationId: message.conversation.organizationId,
    teamId: message.conversation.teamId,
    userId: uuidValue(payload.authorId) || campaign?.createdById || null,
    companyId: message.conversation.contact.companies[0]?.companyId || null,
    contactId: message.conversation.contactId,
    category: 'WHATSAPP' as const,
    origin,
    status: messageActivityStatus(message.status),
    direction: 'OUTBOUND' as const,
    type: 'whatsapp.sent',
    title: 'Mensagem WhatsApp enviada',
    body: message.text?.slice(0, 10_000) || null,
    sourceType: 'WHATSAPP_MESSAGE',
    sourceId: message.id,
    occurredAt: message.sentAt,
    completedAt: message.sentAt,
    details: {
      conversationId: message.conversationId,
      messageType: message.type,
      ...(campaignId ? { campaignId } : {}),
    } satisfies Prisma.InputJsonObject,
  };
  return db.activity.upsert({
    where: { organizationId_sourceType_sourceId: {
      organizationId: message.conversation.organizationId,
      sourceType: 'WHATSAPP_MESSAGE',
      sourceId: message.id,
    } },
    create: data,
    update: {
      teamId: data.teamId,
      userId: data.userId,
      companyId: data.companyId,
      contactId: data.contactId,
      origin: data.origin,
      status: data.status,
      title: data.title,
      body: data.body,
      occurredAt: data.occurredAt,
      completedAt: data.completedAt,
      details: data.details,
    },
  });
}

export async function markLatestWhatsappActivityReplied(db: ActivityDatabase, conversationId: string) {
  const messages = await db.message.findMany({
    where: { conversationId, direction: 'OUTBOUND', sentAt: { not: null } },
    orderBy: { sentAt: 'desc' },
    take: 20,
    select: {
      id: true,
      payload: true,
      conversation: { select: { organizationId: true } },
    },
  });
  const message = messages.find((candidate) => {
    const payload = objectValue(candidate.payload);
    return ['authorId', 'campaignId', 'followUpId', 'enrollmentId', 'automated', 'aiGenerationId']
      .some((key) => Object.hasOwn(payload, key));
  });
  if (!message) return null;
  await projectWhatsappMessageActivity(db, message.id);
  return db.activity.updateMany({
    where: {
      organizationId: message.conversation.organizationId,
      sourceType: 'WHATSAPP_MESSAGE',
      sourceId: message.id,
      deletedAt: null,
    },
    data: { status: ActivityStatus.REPLIED },
  });
}

export async function projectEmailRecipientActivity(db: ActivityDatabase, recipientId: string) {
  const recipient = await db.campaignRecipient.findUnique({
    where: { id: recipientId },
    include: {
      campaign: { include: { createdBy: { select: { id: true, teamId: true } }, bubbles: { orderBy: { position: 'asc' }, take: 1 } } },
      contact: { select: { companies: { where: { isPrimary: true }, select: { companyId: true }, take: 1 } } },
    },
  });
  if (!recipient?.sentAt || recipient.campaign.channel !== 'EMAIL') return null;
  const status = messageActivityStatus(recipient.status);
  const data = {
    organizationId: recipient.campaign.organizationId,
    teamId: recipient.campaign.createdBy.teamId,
    userId: recipient.campaign.createdBy.id,
    companyId: recipient.contact.companies[0]?.companyId || null,
    contactId: recipient.contactId,
    category: 'EMAIL' as const,
    origin: 'CAMPAIGN' as const,
    status,
    direction: 'OUTBOUND' as const,
    type: 'email.sent',
    title: recipient.campaign.emailSubject || 'E-mail enviado',
    body: recipient.campaign.bubbles[0]?.content.slice(0, 10_000) || null,
    sourceType: 'EMAIL_RECIPIENT',
    sourceId: recipient.id,
    occurredAt: recipient.sentAt,
    completedAt: recipient.sentAt,
    details: { campaignId: recipient.campaignId, recipientId: recipient.id } satisfies Prisma.InputJsonObject,
  };
  return db.activity.upsert({
    where: { organizationId_sourceType_sourceId: { organizationId: data.organizationId, sourceType: data.sourceType, sourceId: data.sourceId } },
    create: data,
    update: { status, title: data.title, body: data.body, details: data.details },
  });
}

export async function projectNoteActivity(db: ActivityDatabase, noteId: string, origin = ActivityOrigin.MANUAL) {
  const note = await db.note.findUnique({
    where: { id: noteId },
    include: { author: { select: { organizationId: true, teamId: true } } },
  });
  if (!note) return null;
  const data = {
    organizationId: note.author.organizationId,
    teamId: note.author.teamId,
    userId: note.authorId,
    companyId: note.companyId,
    contactId: note.contactId,
    opportunityId: note.opportunityId,
    category: 'NOTE' as const,
    origin,
    status: ActivityStatus.COMPLETED,
    type: 'note.created',
    title: 'Nota adicionada',
    body: note.body,
    sourceType: 'NOTE',
    sourceId: note.id,
    occurredAt: note.createdAt,
    completedAt: note.createdAt,
    details: {} satisfies Prisma.InputJsonObject,
  };
  return db.activity.upsert({
    where: { organizationId_sourceType_sourceId: { organizationId: data.organizationId, sourceType: data.sourceType, sourceId: data.sourceId } },
    create: data,
    update: {
      teamId: data.teamId,
      userId: data.userId,
      companyId: data.companyId,
      contactId: data.contactId,
      opportunityId: data.opportunityId,
      origin: data.origin,
      title: data.title,
      body: data.body,
      occurredAt: data.occurredAt,
      completedAt: data.completedAt,
    },
  });
}

export async function projectTaskActivity(db: ActivityDatabase, taskId: string, origin?: ActivityOrigin) {
  const task = await db.task.findUnique({ where: { id: taskId }, include: { followUp: { select: { id: true } } } });
  if (!task) return null;
  const resolvedOrigin = origin || (task.followUp ? ActivityOrigin.AUTOMATION : ActivityOrigin.MANUAL);
  const status = task.status === 'OPEN'
    ? ActivityStatus.SCHEDULED
    : task.status === 'COMPLETED'
      ? ActivityStatus.COMPLETED
      : ActivityStatus.CANCELLED;
  const data = {
    organizationId: task.organizationId,
    teamId: task.teamId,
    userId: task.assigneeId || task.createdById,
    companyId: task.companyId,
    contactId: task.contactId,
    opportunityId: task.opportunityId,
    category: 'TASK' as const,
    origin: resolvedOrigin,
    status,
    type: 'task',
    title: task.title,
    body: task.description,
    sourceType: 'TASK',
    sourceId: task.id,
    occurredAt: task.createdAt,
    scheduledAt: task.dueAt,
    completedAt: task.completedAt,
    details: {} satisfies Prisma.InputJsonObject,
  };
  return db.activity.upsert({
    where: { organizationId_sourceType_sourceId: { organizationId: data.organizationId, sourceType: data.sourceType, sourceId: data.sourceId } },
    create: data,
    update: {
      teamId: data.teamId,
      userId: data.userId,
      companyId: data.companyId,
      contactId: data.contactId,
      opportunityId: data.opportunityId,
      origin: data.origin,
      status: data.status,
      title: data.title,
      body: data.body,
      scheduledAt: data.scheduledAt,
      completedAt: data.completedAt,
    },
  });
}
