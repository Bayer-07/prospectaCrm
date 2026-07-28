export const CONTACT_IMPORT_FIELDS = [
  { value: 'name', label: 'Nome completo', required: true },
  { value: 'email', label: 'E-mail' },
  { value: 'phone', label: 'Telefone' },
  { value: 'jobTitle', label: 'Cargo' },
  { value: 'source', label: 'Origem' },
  { value: 'externalId', label: 'Identificador externo' },
] as const;

function normalizeHeader(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function separatorCount(line: string, separator: string) {
  let quoted = false;
  let count = 0;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') {
      if (quoted && line[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && line[index] === separator) count += 1;
  }
  return count;
}

export function detectCsvDelimiter(csv: string) {
  const firstLine = csv.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] || '';
  const separators = [',', ';', '\t'];
  return separators.reduce((best, current) =>
    separatorCount(firstLine, current) > separatorCount(firstLine, best) ? current : best);
}

export function parseCsvHeaders(csv: string) {
  const line = csv.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0]?.trim();
  if (!line) return [];
  const delimiter = detectCsvDelimiter(csv);
  const headers: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      headers.push(value.trim());
      value = '';
    } else value += character;
  }
  headers.push(value.trim());
  return headers.filter(Boolean);
}

const HEADER_ALIASES: Record<string, string[]> = {
  name: ['nome', 'nomecompleto', 'contato', 'name', 'fullname'],
  email: ['email', 'correioeletronico'],
  phone: ['telefone', 'celular', 'whatsapp', 'phone', 'fone'],
  jobTitle: ['cargo', 'funcao', 'jobtitle', 'position'],
  source: ['origem', 'source'],
  externalId: ['idexterno', 'identificadorexterno', 'externalid'],
};

export function suggestContactMapping(headers: string[]) {
  const used = new Set<string>();
  return Object.fromEntries(headers.map((header) => {
    const normalized = normalizeHeader(header);
    const field = Object.entries(HEADER_ALIASES)
      .find(([target, aliases]) => !used.has(target) && aliases.includes(normalized))?.[0] || '';
    if (field) used.add(field);
    return [header, field];
  }));
}

