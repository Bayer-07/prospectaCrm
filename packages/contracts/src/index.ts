import { z } from 'zod';
import { normalizePhoneKey } from './whatsapp-contact.js';

export { extractSharedWhatsappContacts, normalizePhoneKey } from './whatsapp-contact.js';
export type { SharedWhatsappContact } from './whatsapp-contact.js';

export {
  contactTemplateVariables,
  DEFAULT_TEMPLATE_TIME_ZONE,
  renderTemplateVariables,
  timeBasedGreeting,
} from './template-variables.js';

export {
  escapeEmailHtml,
  renderBzsEmailLayout,
  renderPasswordResetEmail,
  renderUserInviteEmail,
  sgaProspectingEmailTemplates,
} from './email-templates.js';
export type {
  BrandedEmailCallToAction,
  BrandedEmailLayoutInput,
  DefaultEmailTemplate,
  PasswordResetEmailInput,
  PasswordResetEmailJob,
  UserInviteEmailInput,
  UserInviteEmailJob,
} from './email-templates.js';

export const dataScopes = ['all', 'team', 'own'] as const;
export type DataScope = (typeof dataScopes)[number];

export const consentStatuses = ['unknown', 'granted', 'revoked'] as const;
export type ConsentStatus = (typeof consentStatuses)[number];

export const campaignStatuses = [
  'draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled', 'failed',
] as const;
export type CampaignStatus = (typeof campaignStatuses)[number];

export const deliveryStatuses = [
  'pending', 'queued', 'sent', 'delivered', 'read', 'replied', 'failed', 'skipped', 'opted_out',
] as const;
export type DeliveryStatus = (typeof deliveryStatuses)[number];

export const workflowStatuses = ['draft', 'published', 'paused', 'archived'] as const;
export type WorkflowStatus = (typeof workflowStatuses)[number];

export const opportunityStatuses = ['open', 'won', 'lost'] as const;
export type OpportunityStatus = (typeof opportunityStatuses)[number];

export const channelTypes = ['whatsapp', 'email'] as const;
export type ChannelType = (typeof channelTypes)[number];

export const evolutionInstanceStatuses = ['CONNECTED', 'CONNECTING', 'DISCONNECTED', 'ERROR'] as const;
export type EvolutionInstanceStatus = (typeof evolutionInstanceStatuses)[number];

export function normalizeEvolutionInstanceStatus(value: unknown): EvolutionInstanceStatus {
  const state = String(value || '').trim().toLowerCase().replace(/[\s._-]+/g, '');
  if (state === 'open' || state === 'connected') return 'CONNECTED';
  if (state === 'connecting' || state === 'pairing' || state === 'qrcode') return 'CONNECTING';
  if (state === 'error' || state === 'failed' || state === 'refused') return 'ERROR';
  return 'DISCONNECTED';
}

export const uuidSchema = z.string().uuid();
export const phoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/, 'Telefone deve estar em E.164');

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(160).optional(),
});

export const normalizeCnpj = (value: string) => value.replace(/\D/g, '');

export function formatCnpj(value: string) {
  const digits = normalizeCnpj(value).slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

export function isValidCnpj(value: string) {
  const digits = normalizeCnpj(value);
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;
  const calculateDigit = (base: string, weights: number[]) => {
    const sum = base.split('').reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const firstDigit = calculateDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const secondDigit = calculateDigit(`${digits.slice(0, 12)}${firstDigit}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digits.endsWith(`${firstDigit}${secondDigit}`);
}

export function normalizeLinkedinUrl(value: unknown) {
  if (value === null || value === undefined) return value;
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

const linkedinUrlSchema = z.preprocess(
  normalizeLinkedinUrl,
  z.string().url('Link do LinkedIn inválido').max(300).refine((value) => {
    try {
      const hostname = new URL(value).hostname.toLowerCase();
      return hostname === 'linkedin.com' || hostname.endsWith('.linkedin.com');
    } catch {
      return false;
    }
  }, 'Informe um link do LinkedIn').nullable().optional(),
);

export const companyInputSchema = z.object({
  name: z.string().trim().min(2).max(180),
  legalName: z.string().trim().max(180).optional(),
  cnpj: z.string().trim().max(18)
    .refine((value) => !value || /^(?:\d{14}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})$/.test(value), 'CNPJ contém caracteres inválidos')
    .refine((value) => !value || isValidCnpj(value), 'CNPJ inválido')
    .optional(),
  domain: z.string().trim().toLowerCase().max(160).optional(),
  linkedinUrl: linkedinUrlSchema,
  sector: z.string().trim().max(100).optional(),
  size: z.string().trim().max(60).optional(),
  phone: z.string().trim().max(24).optional(),
  address: z.record(z.string(), z.unknown()).optional(),
  ownerId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  externalId: z.string().trim().max(160).optional(),
  customFields: z.record(z.string(), z.unknown()).default({}),
});
export type CompanyInput = z.infer<typeof companyInputSchema>;

export const contactInputSchema = z.object({
  name: z.string().trim().min(2).max(180),
  jobTitle: z.string().trim().max(120).optional(),
  email: z.string().email().max(180).optional(),
  phone: phoneSchema.optional(),
  companyId: z.string().uuid().nullable().optional(),
  ownerId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  source: z.string().trim().max(80).optional(),
  externalId: z.string().trim().max(160).optional(),
  consentStatus: z.enum(consentStatuses).default('unknown'),
  consentSource: z.string().trim().max(160).optional(),
  consentEvidence: z.string().trim().max(500).optional(),
  campaignsBlocked: z.boolean().optional(),
  customFields: z.record(z.string(), z.unknown()).default({}),
});
export type ContactInput = z.infer<typeof contactInputSchema>;

export const opportunityInputSchema = z.object({
  title: z.string().trim().min(2).max(180),
  companyId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  pipelineId: z.string().uuid(),
  stageId: z.string().uuid(),
  ownerId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  valueCents: z.coerce.number().int().min(0).default(0),
  probability: z.coerce.number().int().min(0).max(100).default(0),
  expectedCloseAt: z.coerce.date().optional(),
  source: z.string().trim().max(80).optional(),
  externalId: z.string().trim().max(160).optional(),
  customFields: z.record(z.string(), z.unknown()).default({}),
});
export type OpportunityInput = z.infer<typeof opportunityInputSchema>;

export const taskInputSchema = z.object({
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(2000).optional(),
  dueAt: z.coerce.date(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  assigneeId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
  opportunityId: z.string().uuid().optional(),
});

export const campaignCadenceSchema = z.object({
  bubbleDelayMinSeconds: z.number().int().min(1).default(3),
  bubbleDelayMaxSeconds: z.number().int().min(1).default(7),
  contactDelayMinSeconds: z.number().int().min(1).default(15),
  contactDelayMaxSeconds: z.number().int().min(1).default(30),
  batchSize: z.number().int().min(1).default(20),
  batchPauseMinSeconds: z.number().int().min(1).default(120),
  batchPauseMaxSeconds: z.number().int().min(1).default(300),
}).superRefine((value, ctx) => {
  if (value.bubbleDelayMinSeconds > value.bubbleDelayMaxSeconds) {
    ctx.addIssue({ code: 'custom', path: ['bubbleDelayMaxSeconds'], message: 'Máximo menor que mínimo' });
  }
  if (value.contactDelayMinSeconds > value.contactDelayMaxSeconds) {
    ctx.addIssue({ code: 'custom', path: ['contactDelayMaxSeconds'], message: 'Máximo menor que mínimo' });
  }
  if (value.batchPauseMinSeconds > value.batchPauseMaxSeconds) {
    ctx.addIssue({ code: 'custom', path: ['batchPauseMaxSeconds'], message: 'Máximo menor que mínimo' });
  }
});

export const workflowNodeTypes = [
  'trigger', 'condition', 'send_whatsapp', 'wait', 'update_record', 'move_stage',
  'assign', 'add_tag', 'remove_tag', 'create_task', 'notify', 'end',
] as const;

export const chatbotNodeTypes = [
  'trigger', 'message', 'question', 'condition', 'add_tag', 'handoff', 'close', 'end',
] as const;
export type ChatbotNodeType = (typeof chatbotNodeTypes)[number];

export const chatbotResponseProviders = ['RULES'] as const;
export type ChatbotResponseProvider = (typeof chatbotResponseProviders)[number];

export type ApiEnvelope<T> = { data: T; meta?: Record<string, unknown> };
export type CursorPage<T> = ApiEnvelope<T[]> & { meta: { nextCursor: string | null; count: number } };

export const DEFAULT_OPT_OUT_WORDS = ['SAIR', 'PARAR', 'CANCELAR', 'REMOVER'] as const;

export function contactsAreDuplicates(a: { phone?: string | null; email?: string | null }, b: { phone?: string | null; email?: string | null }) {
  const aPhoneKey = normalizePhoneKey(a.phone);
  const bPhoneKey = normalizePhoneKey(b.phone);
  return Boolean((aPhoneKey && bPhoneKey && aPhoneKey === bPhoneKey) || (a.email && b.email && a.email.toLowerCase() === b.email.toLowerCase()));
}

export function isOptOutMessage(text?: string | null) {
  const normalized = text?.trim().toLocaleUpperCase('pt-BR') || '';
  return DEFAULT_OPT_OUT_WORDS.some((word) => normalized === word || normalized.startsWith(`${word} `));
}

export function canSendWhatsapp(contact: { phone?: string | null; consentStatus: string; suppressed?: boolean }) {
  if (!contact.phone) return { allowed: false, reason: 'Telefone ausente' } as const;
  if (contact.consentStatus.toUpperCase() !== 'GRANTED') return { allowed: false, reason: 'Consentimento ausente' } as const;
  if (contact.suppressed) return { allowed: false, reason: 'Contato suprimido' } as const;
  return { allowed: true } as const;
}

export function nextWarmupCap(input: { currentCap: number; increment: number; maximumCap: number; sent: number; failed: number; connected: boolean }) {
  const utilization = input.currentCap ? input.sent / input.currentCap : 0;
  const failureRate = input.sent + input.failed ? input.failed / (input.sent + input.failed) : 0;
  const grows = utilization >= 0.8 && failureRate < 0.05 && input.connected;
  return { cap: grows ? Math.min(input.maximumCap, input.currentCap + input.increment) : input.currentCap, grows, utilization, failureRate };
}

export function opportunityStatusForStage(stage: { isWon: boolean; isLost: boolean }) {
  return stage.isWon ? 'WON' as const : stage.isLost ? 'LOST' as const : 'OPEN' as const;
}
