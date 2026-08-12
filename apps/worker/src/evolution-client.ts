export class EvolutionClient {
  private readonly baseUrl = (process.env.EVOLUTION_API_URL || 'http://localhost:8080').replace(/\/$/, '');
  private readonly apiKey = process.env.EVOLUTION_API_KEY || '';
  private readonly maximumAudioBytes = 25 * 1024 * 1024;

  async send(instance: string, input: { number: string; type: string; text?: string; mediaUrl?: string; mediaBase64?: string; quoted?: { key: Record<string, unknown>; message: Record<string, unknown> } }) {
    if (!this.apiKey) throw new Error('EVOLUTION_API_KEY não configurada');
    const number = this.normalizeTarget(input.number);
    const isText = input.type === 'text' || (!input.mediaUrl && !input.mediaBase64);
    const isAudio = input.type === 'audio' && Boolean(input.mediaUrl || input.mediaBase64);
    const path = this.messagePath(instance, isText, isAudio);
    const body = await this.messageBody(number, input, isText, isAudio);
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: this.apiKey }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const raw = await response.text();
    let result: Record<string, any> = {};
    try { result = raw ? JSON.parse(raw) : {}; } catch { result = { raw }; }
    if (!response.ok) throw new Error(`Evolution ${response.status}: ${raw.slice(0, 500)}`);
    return result;
  }

  private messagePath(instance: string, isText: boolean, isAudio: boolean) {
    const encodedInstance = encodeURIComponent(instance);
    if (isText) return `/message/sendText/${encodedInstance}`;
    if (isAudio) return `/message/sendWhatsAppAudio/${encodedInstance}`;
    return `/message/sendMedia/${encodedInstance}`;
  }

  private async messageBody(
    number: string,
    input: { type: string; text?: string; mediaUrl?: string; mediaBase64?: string; quoted?: { key: Record<string, unknown>; message: Record<string, unknown> } },
    isText: boolean,
    isAudio: boolean,
  ) {
    const quoted = input.quoted ? { quoted: input.quoted } : {};
    if (isText) return { number, text: input.text || '', delay: 0, linkPreview: true, ...quoted };
    if (isAudio) {
      const audio = input.mediaBase64 || await this.audioBase64(input.mediaUrl!);
      return { number, audio, delay: 0, ...quoted };
    }
    return { number, mediatype: input.type, media: input.mediaUrl, caption: input.text || '', ...quoted };
  }

  private async audioBase64(url: string) {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Não foi possível preparar o áudio para envio (${response.status})`);
    const declaredBytes = Number(response.headers.get('content-length') || 0);
    if (declaredBytes > this.maximumAudioBytes) throw new Error('O áudio ultrapassa o limite de 25 MB');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) throw new Error('O arquivo de áudio está vazio');
    if (bytes.length > this.maximumAudioBytes) throw new Error('O áudio ultrapassa o limite de 25 MB');
    return bytes.toString('base64');
  }

  async getMedia(instance: string, message: Record<string, unknown>) {
    if (!this.apiKey) throw new Error('EVOLUTION_API_KEY não configurada');
    const response = await fetch(`${this.baseUrl}/chat/getBase64FromMediaMessage/${encodeURIComponent(instance)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: this.apiKey },
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(30_000),
    });
    const raw = await response.text();
    let result: Record<string, any> = {};
    try { result = raw ? JSON.parse(raw) : {}; } catch { result = { raw }; }
    if (!response.ok) throw new Error(`Evolution ${response.status}: ${raw.slice(0, 500)}`);
    if (typeof result.base64 !== 'string' || !result.base64) throw new Error('A Evolution não retornou o arquivo da mídia');
    return result as { base64: string; mimetype?: string; fileName?: string; mediaType?: string };
  }

  async findMessages(instance: string, remoteJid?: string, limit = 50) {
    if (!this.apiKey) throw new Error('EVOLUTION_API_KEY não configurada');
    const response = await fetch(`${this.baseUrl}/chat/findMessages/${encodeURIComponent(instance)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: this.apiKey },
      body: JSON.stringify({ where: remoteJid ? { key: { remoteJid } } : {}, page: 1, offset: limit }),
      signal: AbortSignal.timeout(30_000),
    });
    const raw = await response.text();
    let result: Record<string, any> = {};
    try { result = raw ? JSON.parse(raw) : {}; } catch { result = { raw }; }
    if (!response.ok) throw new Error(`Evolution ${response.status}: ${raw.slice(0, 500)}`);
    const records = result.messages?.records || result.records || result.data || [];
    return Array.isArray(records) ? records as Array<Record<string, any>> : [];
  }

  async findMessage(instance: string, providerMessageId: string) {
    if (!this.apiKey) throw new Error('EVOLUTION_API_KEY nÃ£o configurada');
    const response = await fetch(`${this.baseUrl}/chat/findMessages/${encodeURIComponent(instance)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: this.apiKey },
      body: JSON.stringify({ where: { key: { id: providerMessageId } }, page: 1, offset: 5 }),
      signal: AbortSignal.timeout(30_000),
    });
    const raw = await response.text();
    let result: Record<string, any> = {};
    try { result = raw ? JSON.parse(raw) : {}; } catch { result = { raw }; }
    if (!response.ok) throw new Error(`Evolution ${response.status}: ${raw.slice(0, 500)}`);
    const records = result.messages?.records || result.records || result.data || [];
    return Array.isArray(records)
      ? records.find((record) => String(record?.key?.id || record?.key?.ID || record?.id || '') === providerMessageId)
      : undefined;
  }

  async checkWhatsappNumbers(instance: string, numbers: string[]) {
    if (!this.apiKey) throw new Error('EVOLUTION_API_KEY não configurada');
    const normalized = [...new Set(numbers.map((number) => number.replace(/\D/g, '')).filter(Boolean))];
    const response = await fetch(`${this.baseUrl}/chat/whatsappNumbers/${encodeURIComponent(instance)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: this.apiKey },
      body: JSON.stringify({ numbers: normalized }),
      signal: AbortSignal.timeout(30_000),
    });
    const raw = await response.text();
    let result: Record<string, any> | Array<Record<string, any>> = {};
    try { result = raw ? JSON.parse(raw) : {}; } catch { result = { raw }; }
    if (!response.ok) throw new Error(`Evolution ${response.status}: ${raw.slice(0, 500)}`);
    const items = numberCheckItems(result);
    const byNumber = new Map(items.map((item) => [
      String(item.number || item.jid || '').split('@')[0].replace(/\D/g, ''),
      item.exists === true,
    ]));
    return normalized.map((number) => ({ number, exists: byNumber.get(number) === true }));
  }

  private normalizeTarget(value: string) {
    const [local, suffix] = value.trim().split('@', 2);
    const digits = local.replace(/\D/g, '');
    if (!suffix) return digits;
    const jidSuffix = suffix.toLowerCase();
    return ['lid', 's.whatsapp.net', 'g.us', 'broadcast'].includes(jidSuffix) ? `${digits}@${jidSuffix}` : digits;
  }
}

function numberCheckItems(result: Record<string, any> | Array<Record<string, any>>) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result.numbers)) return result.numbers;
  return Array.isArray(result.data) ? result.data : [];
}
