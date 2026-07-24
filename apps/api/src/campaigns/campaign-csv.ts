import { parse } from 'csv-parse/sync';
import { normalizePhoneKey } from '@prospecta/contracts';

export type CampaignCsvRow = {
  row: number;
  name: string;
  phone: string;
  email?: string;
  messages: string[];
};

export type CampaignCsvPreview = {
  total: number;
  valid: number;
  invalid: number;
  columns: string[];
  rows: CampaignCsvRow[];
  errors: Array<{ row: number; error: string }>;
};

const normalizeHeader = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_|_$/g, '');

function detectDelimiter(csv: string) {
  const line = csv.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] || '';
  const counts = new Map([[',', 0], [';', 0], ['\t', 0]]);
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') {
      if (quoted && line[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && counts.has(line[index])) {
      counts.set(line[index], (counts.get(line[index]) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || ',';
}

function normalizePhone(value: string) {
  const trimmed = value.trim();
  let digits = trimmed.replace(/\D/g, '');
  if (!trimmed.startsWith('+') && (digits.length === 10 || digits.length === 11)) digits = `55${digits}`;
  if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) return null;
  return `+${digits}`;
}

export function parseCampaignCsv(csv: string): CampaignCsvPreview {
  if (!csv?.trim()) throw new Error('Selecione um arquivo CSV preenchido');

  let records: Record<string, string>[];
  try {
    records = parse(csv.replace(/^\uFEFF/, ''), {
      columns: true,
      delimiter: detectDelimiter(csv),
      skip_empty_lines: true,
      trim: true,
      relax_column_count: false,
    }) as Record<string, string>[];
  } catch (error) {
    throw new Error(`Não foi possível ler o CSV: ${error instanceof Error ? error.message : 'formato inválido'}`);
  }
  if (!records.length) throw new Error('O CSV não possui contatos');

  const columns = Object.keys(records[0]);
  const normalizedColumns = columns.map((column, index) => ({ column, index, normalized: normalizeHeader(column) }));
  const findColumn = (...aliases: string[]) => normalizedColumns.find((item) => aliases.includes(item.normalized))?.column;
  const phoneColumn = findColumn('telefone', 'phone', 'numero', 'number', 'whatsapp', 'celular');
  const nameColumn = findColumn('nome', 'name', 'contato', 'contact');
  const emailColumn = findColumn('email', 'e_mail');
  const messageColumns = normalizedColumns
    .filter((item) => /^(mensagem|message|texto)(?:_|$)/.test(item.normalized) || ['mensagem', 'message', 'texto'].includes(item.normalized))
    .sort((left, right) => left.index - right.index)
    .map((item) => item.column);

  if (!phoneColumn) throw new Error('O CSV precisa ter uma coluna “telefone”');
  if (!messageColumns.length) throw new Error('O CSV precisa ter ao menos uma coluna “mensagem”');

  const rows: CampaignCsvRow[] = [];
  const errors: Array<{ row: number; error: string }> = [];
  const seenPhones = new Set<string>();
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const row = index + 2;
    const phone = normalizePhone(record[phoneColumn] || '');
    const messages = messageColumns.map((column) => String(record[column] || '').trim()).filter(Boolean);
    if (!phone) {
      errors.push({ row, error: 'Telefone inválido' });
      continue;
    }
    const phoneKey = normalizePhoneKey(phone)!;
    if (seenPhones.has(phoneKey)) {
      errors.push({ row, error: 'Telefone duplicado no arquivo' });
      continue;
    }
    if (!messages.length) {
      errors.push({ row, error: 'Informe ao menos uma mensagem' });
      continue;
    }
    seenPhones.add(phoneKey);
    rows.push({
      row,
      phone,
      name: String(nameColumn ? record[nameColumn] || '' : '').trim() || phone,
      email: String(emailColumn ? record[emailColumn] || '' : '').trim().toLowerCase() || undefined,
      messages,
    });
  }

  return {
    total: records.length,
    valid: rows.length,
    invalid: errors.length,
    columns,
    rows,
    errors,
  };
}
