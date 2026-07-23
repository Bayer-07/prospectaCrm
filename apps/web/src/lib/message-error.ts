export type MessageFailure = { summary: string; detail?: string };

export function describeMessageFailure(payload?: Record<string, unknown>): MessageFailure {
  const rawValue = payload?.error;
  if (!rawValue) return { summary: 'O provedor não informou o motivo da falha.' };
  const raw = (typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue)).replace(/\s+/g, ' ').trim().slice(0, 700);
  const normalized = raw.toLowerCase();
  const withDetail = (summary: string): MessageFailure => ({ summary, detail: raw });

  if (/401|403|unauthori[sz]ed|forbidden|api.?key|apikey/.test(normalized)) return withDetail('A Evolution API recusou a autenticação da conexão.');
  if (/timeout|timed out|aborted|aborterror/.test(normalized)) return withDetail('A Evolution API demorou demais para responder.');
  if (/fetch failed|econnrefused|enotfound|network|socket hang up/.test(normalized)) return withDetail('Não foi possível comunicar com a Evolution API.');
  if (/instance/.test(normalized) && /not found|does not exist|404|não encontrad/.test(normalized)) return withDetail('A conexão do WhatsApp não foi encontrada na Evolution API.');
  if (/not connected|disconnected|connection closed|connection.*close|logged out/.test(normalized)) return withDetail('O número do WhatsApp estava desconectado no momento do envio.');
  if (/invalid number|number.*invalid|not.*whatsapp|does not exist.*whatsapp|jid.*invalid/.test(normalized)) return withDetail('O telefone do destinatário não é válido ou não possui WhatsApp.');
  if (/owned media must be a url or base64|media must be a url or base64/.test(normalized)) return withDetail('A Evolution API rejeitou a mídia porque ela não foi reconhecida como uma URL válida ou arquivo base64.');
  if (/413|payload too large|file.*large|media.*large/.test(normalized)) return withDetail('O arquivo excede o tamanho aceito pelo WhatsApp.');
  return { summary: raw };
}
