import { renderTemplateVariables, renderUrlTemplateVariables } from '@prospecta/contracts';

export type ChatbotRuleContext = {
  lastMessage: string;
  contactName: string;
  contactPhone?: string | null;
  contactEmail?: string | null;
  contactJobTitle?: string | null;
  contactCompany?: string | null;
  conversationId: string;
  variables?: Record<string, unknown>;
};

export interface ChatbotResponseProvider {
  readonly key: string;
  matches(data: Record<string, unknown>, context: ChatbotRuleContext): boolean;
  interpolate(template: string, context: ChatbotRuleContext): string;
  interpolateUrl(template: string, context: ChatbotRuleContext): string;
}

const scalarText = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return `${value}`;
  return '';
};

export const normalizeRuleText = (value: unknown) => scalarText(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLocaleLowerCase('pt-BR');

export class RulesResponseProvider implements ChatbotResponseProvider {
  readonly key: string = 'RULES';

  matches(data: Record<string, unknown>, context: ChatbotRuleContext) {
    const actual = normalizeRuleText(context.lastMessage);
    const values = scalarText(data.value).split(/[\n,;]/).map(normalizeRuleText).filter(Boolean);
    if (!values.length) return true;
    const operator = typeof data.operator === 'string' ? data.operator : 'contains';
    if (operator === 'equals') return values.includes(actual);
    if (operator === 'starts_with') return values.some((value) => actual.startsWith(value));
    if (operator === 'ends_with') return values.some((value) => actual.endsWith(value));
    return values.some((value) => actual.includes(value));
  }

  private variables(context: ChatbotRuleContext) {
    return {
      nome: context.contactName,
      telefone: context.contactPhone || '',
      email: context.contactEmail || '',
      empresa: context.contactCompany || '',
      cargo: context.contactJobTitle || '',
      mensagem: context.lastMessage,
      ...(context.variables || {}),
    };
  }

  interpolate(template: string, context: ChatbotRuleContext) {
    return renderTemplateVariables(template, this.variables(context));
  }

  interpolateUrl(template: string, context: ChatbotRuleContext) {
    return renderUrlTemplateVariables(template, this.variables(context));
  }
}

export class OpenAiResponseProvider extends RulesResponseProvider {
  override readonly key = 'OPENAI';
}
