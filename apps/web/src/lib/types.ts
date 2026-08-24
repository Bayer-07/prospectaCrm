export type UserContext = {
  userId?: string; organizationId: string; teamId?: string; teamIds?: string[]; name: string; email?: string;
  sessionExpiresAt?: string;
  messageSignatureEnabled?: boolean;
  profilePhotoId?: string | null;
  profilePhotoUpdatedAt?: string;
  roleKey?: string; permissions: Array<{ resource: string; action: string; scope: string }>;
};

export type Company = { id: string; name: string; legalName?: string; sector?: string; size?: string; domain?: string; linkedinUrl?: string | null; logoId?: string | null; cnpj?: string; phone?: string; address?: Record<string, unknown>; createdAt?: string; updatedAt: string; owner?: { id: string; name: string }; team?: { id: string; name: string; color: string }; _count?: { contacts: number; opportunities: number } };
export type Contact = { id: string; name: string; email?: string; phone?: string; jobTitle?: string; consentStatus: 'UNKNOWN' | 'GRANTED' | 'REVOKED'; campaignsBlocked?: boolean; consentSource?: string; source?: string; consentGrantedAt?: string; consentRevokedAt?: string; createdAt?: string; updatedAt?: string; owner?: { id?: string; name: string }; team?: { id?: string; name: string; color: string }; companies?: Array<{ isPrimary?: boolean; company: Company }>; tags?: Array<{ tag: { id: string; name: string; color: string } }>; opportunities?: Array<{ isPrimary?: boolean; opportunity: { id: string; title: string; valueCents: number; status: string; updatedAt?: string; owner?: { id: string; name: string }; team?: { id: string; name: string; color: string }; stage: { id: string; name: string; color: string } } }>; tasks?: Array<{ id: string; title: string; status: string; dueAt: string }>; consentEvents?: Array<{ id: string; status: string; source: string; evidence?: string; occurredAt: string }> };
export type Opportunity = { id: string; title: string; valueCents: number; probability: number; stageId: string; updatedAt: string; company?: Company; owner?: { id: string; name: string } };
export type Stage = { id: string; name: string; color: string; position: number; opportunities: Opportunity[] };
export type Pipeline = { id: string; name: string; stages: Stage[] };
export type Conversation = { id: string; unreadCount: number; status: string; lastMessageAt?: string; isPinned?: boolean; contact: Contact; assignee?: { id: string; name: string }; team?: { id: string; name: string; color: string; isDefault?: boolean } | null; instance: { id: string; name: string; phone?: string; status: string; archivedAt?: string | null }; followUps?: Array<{ id: string; status: string; scheduledAt: string; mode: string }>; messages: Array<Message>; events?: Array<ConversationEvent> };
export type Message = {
  id: string;
  conversationId: string;
  providerMessageId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  type: string;
  text?: string;
  status: string;
  createdAt: string;
  payload?: Record<string, unknown>;
  transcriptionStatus?: string;
  transcriptionText?: string;
  transcriptionError?: string;
  transcriptionProvider?: string;
  transcribedAt?: string;
  media?: Array<{ id: string; filename: string; contentType: string; sizeBytes: number }>;
};
export type ConversationEvent = { id: string; type: string; text: string; createdAt: string; actor?: { id: string; name: string } };
