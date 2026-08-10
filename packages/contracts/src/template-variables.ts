export const DEFAULT_TEMPLATE_TIME_ZONE = 'America/Sao_Paulo';

type ContactTemplateSource = {
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  jobTitle?: unknown;
  companies?: Array<{ company?: { name?: unknown } | null }> | null;
};

function text(value: unknown) {
  return value === null || value === undefined ? '' : String(value);
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
    saudacao: timeBasedGreeting(date, timeZone),
  };
}

export function renderTemplateVariables(
  template: string,
  variables: Record<string, unknown> = {},
  date = new Date(),
  timeZone = DEFAULT_TEMPLATE_TIME_ZONE,
) {
  const normalizedVariables = Object.fromEntries(
    Object.entries(variables).map(([key, value]) => [key.toLocaleLowerCase('pt-BR'), value]),
  );
  normalizedVariables.saudacao = timeBasedGreeting(date, timeZone);

  return template.replace(/{{\s*([\w.]+)\s*}}/gi, (_match, key: string) => (
    text(normalizedVariables[key.toLocaleLowerCase('pt-BR')])
  ));
}
