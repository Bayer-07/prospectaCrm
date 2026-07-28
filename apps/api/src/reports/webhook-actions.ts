export const OUTBOUND_WEBHOOK_ACTIONS = [
  { value: 'company.created', label: 'Empresa criada', group: 'Empresas' },
  { value: 'company.updated', label: 'Empresa atualizada', group: 'Empresas' },
  { value: 'company.archived', label: 'Empresa excluída', group: 'Empresas' },
  { value: 'contact.created', label: 'Contato criado', group: 'Contatos' },
  { value: 'contact.updated', label: 'Contato atualizado', group: 'Contatos' },
  { value: 'contact.archived', label: 'Contato excluído', group: 'Contatos' },
  { value: 'opportunity.created', label: 'Oportunidade criada', group: 'Oportunidades' },
  { value: 'opportunity.updated', label: 'Oportunidade atualizada', group: 'Oportunidades' },
  { value: 'opportunity.stage_changed', label: 'Oportunidade mudou de etapa', group: 'Oportunidades' },
  { value: 'opportunity.archived', label: 'Oportunidade excluída', group: 'Oportunidades' },
  { value: 'task.created', label: 'Tarefa criada', group: 'Tarefas' },
  { value: 'task.updated', label: 'Tarefa atualizada', group: 'Tarefas' },
  { value: 'task.completed', label: 'Tarefa concluída', group: 'Tarefas' },
  { value: 'task.cancelled', label: 'Tarefa cancelada', group: 'Tarefas' },
] as const;

export type OutboundWebhookAction = (typeof OUTBOUND_WEBHOOK_ACTIONS)[number]['value'];

const actionValues = new Set<string>(OUTBOUND_WEBHOOK_ACTIONS.map((action) => action.value));

export function isOutboundWebhookAction(value: string): value is OutboundWebhookAction {
  return actionValues.has(value);
}
