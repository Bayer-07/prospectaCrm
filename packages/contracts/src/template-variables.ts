export const DEFAULT_TEMPLATE_TIME_ZONE = 'America/Sao_Paulo';

type ContactTemplateSource = {
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  jobTitle?: unknown;
  companies?: Array<{ company?: { name?: unknown } | null }> | null;
};

function text(value: unknown) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return `${value}`;
  }
  if (value !== null && typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return '';
}

function objectValue(value: unknown, key: string) {
  if (Array.isArray(value) && /^\d+$/u.test(key)) return value[Number(key)];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const matchingKey = Object.keys(record).find((candidate) => (
    candidate.toLocaleLowerCase('pt-BR') === key.toLocaleLowerCase('pt-BR')
  ));
  return matchingKey === undefined ? undefined : record[matchingKey];
}

function variableValue(variables: Record<string, unknown>, path: string) {
  return path.split('.').reduce<unknown>((current, key) => objectValue(current, key), variables);
}

export function timeBasedGreeting(
  date = new Date(),
  timeZone = DEFAULT_TEMPLATE_TIME_ZONE,
) {
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(date));

  if (hour >= 5 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function currentWeekday(
  date = new Date(),
  timeZone = DEFAULT_TEMPLATE_TIME_ZONE,
) {
  const weekday = new Intl.DateTimeFormat('pt-BR', { timeZone, weekday: 'long' }).format(date);
  return weekday.charAt(0).toLocaleUpperCase('pt-BR') + weekday.slice(1);
}

/** Variáveis que dependem do momento do envio e não podem ser sobrescritas pelo chamador. */
export function sendTimeTemplateVariables(
  date = new Date(),
  timeZone = DEFAULT_TEMPLATE_TIME_ZONE,
) {
  return {
    saudacao: timeBasedGreeting(date, timeZone),
    dia_semana: currentWeekday(date, timeZone),
  };
}

export function contactTemplateVariables(
  contact: ContactTemplateSource,
  date = new Date(),
  timeZone = DEFAULT_TEMPLATE_TIME_ZONE,
) {
  return {
    nome: text(contact.name),
    telefone: text(contact.phone),
    email: text(contact.email),
    empresa: text(contact.companies?.[0]?.company?.name),
    cargo: text(contact.jobTitle),
    ...sendTimeTemplateVariables(date, timeZone),
  };
}

export function renderTemplateVariables(
  template: string,
  variables: Record<string, unknown> = {},
  date = new Date(),
  timeZone = DEFAULT_TEMPLATE_TIME_ZONE,
) {
  const availableVariables = { ...variables, ...sendTimeTemplateVariables(date, timeZone) };

  return template.replace(/{{\s*([\w.]+)\s*}}/gi, (_match, key: string) => (
    text(variableValue(availableVariables, key))
  ));
}

const PROMPT_VARIABLE_MAX_LENGTH = 1_000;

/**
 * Substitui variáveis em instruções enviadas à IA. Diferente das mensagens, uma
 * variável sem valor permanece como `{{chave}}`, para que o modelo possa
 * repeti-la e ela seja resolvida somente no envio (caso de `{{saudacao}}`, que
 * depende do horário em que a mensagem sai). Cada valor entra entre aspas, em
 * uma única linha e com tamanho limitado, porque nome, mensagem e respostas
 * vêm do contato e não podem se passar por novas instruções.
 */
export function renderPromptTemplateVariables(
  template: string,
  variables: Record<string, unknown> = {},
) {
  return template.replace(/{{\s*([\w.]+)\s*}}/gi, (match, key: string) => {
    const value = variableValue(variables, key);
    if (value === undefined || value === null) return match;
    const rendered = text(value).trim();
    if (!rendered) return 'não informado';
    return JSON.stringify(rendered.slice(0, PROMPT_VARIABLE_MAX_LENGTH));
  });
}

export function renderUrlTemplateVariables(
  template: string,
  variables: Record<string, unknown> = {},
  date = new Date(),
  timeZone = DEFAULT_TEMPLATE_TIME_ZONE,
) {
  const availableVariables = { ...variables, ...sendTimeTemplateVariables(date, timeZone) };

  return template.replace(/{{\s*([\w.]+)\s*}}/gi, (_match, key: string) => {
    const value = variableValue(availableVariables, key);
    if (value === undefined) {
      throw new Error(`A variável {{${key}}} não está disponível neste atendimento`);
    }
    return encodeURIComponent(text(value));
  });
}
