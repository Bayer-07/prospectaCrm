export type ActivityCategory = 'CALL' | 'NOTE' | 'MEETING' | 'TASK' | 'WHATSAPP' | 'EMAIL' | 'SYSTEM';
export type ActivityOrigin = 'MANUAL' | 'INBOX' | 'CAMPAIGN' | 'AUTOMATION' | 'SYSTEM';

export type Activity = {
  id: string;
  category: ActivityCategory;
  origin: ActivityOrigin;
  status: string;
  direction?: string | null;
  title: string;
  body?: string | null;
  outcome?: string | null;
  durationSeconds?: number | null;
  occurredAt: string;
  scheduledAt?: string | null;
  completedAt?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  details?: Record<string, unknown> | null;
  user?: { id: string; name: string } | null;
  team?: { id: string; name: string; color: string } | null;
  company?: { id: string; name: string } | null;
  contact?: { id: string; name: string; phone?: string | null } | null;
  opportunity?: { id: string; title: string } | null;
};

export const activityCategoryLabels: Record<ActivityCategory, string> = {
  CALL: 'Ligação', NOTE: 'Nota', MEETING: 'Reunião', TASK: 'Tarefa',
  WHATSAPP: 'WhatsApp', EMAIL: 'E-mail', SYSTEM: 'Sistema',
};

export const activityOriginLabels: Record<ActivityOrigin, string> = {
  MANUAL: 'Manual', INBOX: 'Inbox', CAMPAIGN: 'Campanha',
  AUTOMATION: 'Automação', SYSTEM: 'Sistema',
};

export const activityStatusLabels: Record<string, string> = {
  SCHEDULED: 'Agendada', COMPLETED: 'Concluída', SENT: 'Enviada',
  DELIVERED: 'Entregue', READ: 'Lida', REPLIED: 'Respondida', FAILED: 'Falhou', CANCELLED: 'Cancelada',
};

export const activityOutcomeLabels: Record<string, string> = {
  connected: 'Atendida', no_answer: 'Não atendeu', busy: 'Ocupado', voicemail: 'Caixa postal', wrong_number: 'Número incorreto',
  held: 'Realizada', no_show: 'Não compareceu', rescheduled: 'Reagendada', cancelled: 'Cancelada',
};

export function activitySourceUrl(activity: Activity) {
  const details = activity.details || {};
  if (typeof details.conversationId === 'string') return `/inbox/${details.conversationId}`;
  if (typeof details.campaignId === 'string') return activity.category === 'EMAIL' ? '/email' : '/campanhas';
  if (activity.opportunity) return `/pipeline?opportunity=${activity.opportunity.id}`;
  if (activity.company) return `/empresas?company=${activity.company.id}`;
  if (activity.contact) return `/contatos?contact=${activity.contact.id}`;
  return null;
}

export function activityDuration(seconds?: number | null) {
  if (!seconds) return '';
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (!minutes) return `${remainder}s`;
  return remainder ? `${minutes}min ${remainder}s` : `${minutes}min`;
}
