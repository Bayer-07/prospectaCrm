const DEFAULT_TRANSCRIPTION_URL = 'http://localhost:8000/v1/audio/transcriptions';

export class TranscriptionConfigurationError extends Error {}

export type TranscriptionInput = {
  body: Buffer;
  filename: string;
  contentType: string;
};

export type TranscriptionResult = {
  text: string;
  provider: string;
};

export class TranscriptionClient {
  private readonly apiUrl = (process.env.TRANSCRIPTION_API_URL || DEFAULT_TRANSCRIPTION_URL).trim();
  private readonly apiKey = (
    process.env.TRANSCRIPTION_API_KEY
    || (/^https?:\/\/api\.openai\.com(?:\/|$)/i.test(this.apiUrl) ? process.env.OPENAI_API_KEY : '')
    || ''
  ).trim();
  private readonly model = (process.env.TRANSCRIPTION_MODEL || 'Systran/faster-whisper-small').trim();
  private readonly language = (process.env.TRANSCRIPTION_LANGUAGE || 'pt').trim();
  private readonly prompt = (process.env.TRANSCRIPTION_PROMPT || '').trim();
  private readonly timeoutMs = Math.min(Math.max(Number(process.env.TRANSCRIPTION_TIMEOUT_MS) || 120_000, 10_000), 10 * 60_000);
  private readonly modelDownloadTimeoutMs = Math.min(
    Math.max(Number(process.env.TRANSCRIPTION_MODEL_DOWNLOAD_TIMEOUT_MS) || 10 * 60_000, 30_000),
    30 * 60_000,
  );
  private modelDownloadPromise: Promise<void> | null = null;

  async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    if (!this.apiUrl) throw new TranscriptionConfigurationError('TRANSCRIPTION_API_URL não configurada');
    if (!this.apiKey && /^https?:\/\/api\.openai\.com(?:\/|$)/i.test(this.apiUrl)) {
      throw new TranscriptionConfigurationError('Configure TRANSCRIPTION_API_KEY ou OPENAI_API_KEY para transcrever áudios');
    }
    if (!this.model) throw new TranscriptionConfigurationError('TRANSCRIPTION_MODEL não configurado');

    let { response, raw, data } = await this.sendTranscription(input);
    if (response.status === 404 && this.isMissingLocalModel(data, raw)) {
      await this.downloadLocalModel();
      ({ response, raw, data } = await this.sendTranscription(input));
    }

    if (!response.ok) {
      const detail = this.errorMessage(data) || raw || `HTTP ${response.status}`;
      throw new Error(`Falha no provedor de transcrição (${response.status}): ${detail}`.slice(0, 2_000));
    }
    const text = transcriptionText(data);
    if (!text) throw new Error('O provedor não retornou texto para este áudio');

    return {
      text,
      provider: `${this.providerName()} · ${this.model}`,
    };
  }

  private async sendTranscription(input: TranscriptionInput) {
    const form = new FormData();
    const bytes = new Uint8Array(input.body.byteLength);
    bytes.set(input.body);
    form.append('file', new Blob([bytes], { type: input.contentType || 'application/octet-stream' }), input.filename || 'audio.ogg');
    form.append('model', this.model);
    form.append('response_format', 'json');
    if (this.language) form.append('language', this.language);
    if (this.prompt) form.append('prompt', this.prompt);

    let response: Response;
    try {
      response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : undefined,
        body: form,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new Error(`Provedor de transcrição indisponível: ${error instanceof Error ? error.message : String(error)}`);
    }

    const raw = await response.text();
    return {
      response,
      raw,
      data: this.parseJson(raw),
    };
  }

  private isMissingLocalModel(data: Record<string, any> | null, raw: string) {
    const detail = String(data?.detail || this.errorMessage(data) || raw).toLowerCase();
    return detail.includes('model') && detail.includes('not installed locally');
  }

  private async downloadLocalModel() {
    this.modelDownloadPromise ??= this.performModelDownload().finally(() => {
      this.modelDownloadPromise = null;
    });
    return this.modelDownloadPromise;
  }

  private async performModelDownload() {
    let url: URL;
    try {
      url = new URL(this.apiUrl);
      const endpoint = '/v1/audio/transcriptions';
      if (!url.pathname.endsWith(endpoint)) throw new Error('endpoint incompatível');
      url.pathname = `${url.pathname.slice(0, -endpoint.length)}/v1/models/${encodeURIComponent(this.model)}`;
      url.search = '';
    } catch {
      throw new Error(`O modelo "${this.model}" não está instalado e o provedor não oferece instalação automática`);
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : undefined,
        signal: AbortSignal.timeout(this.modelDownloadTimeoutMs),
      });
    } catch (error) {
      throw new Error(`Não foi possível instalar o modelo local "${this.model}": ${error instanceof Error ? error.message : String(error)}`);
    }

    if (!response.ok) {
      const raw = await response.text();
      const detail = this.errorMessage(this.parseJson(raw)) || raw || `HTTP ${response.status}`;
      throw new Error(`Não foi possível instalar o modelo local "${this.model}" (${response.status}): ${detail}`.slice(0, 2_000));
    }
  }

  private parseJson(raw: string): Record<string, any> | null {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed as Record<string, any> : null;
    } catch {
      return null;
    }
  }

  private errorMessage(data: Record<string, any> | null) {
    const error = data?.error;
    if (typeof error === 'string') return error;
    if (typeof error?.message === 'string') return error.message;
    if (typeof data?.message === 'string') return data.message;
    return '';
  }

  private providerName() {
    try {
      return new URL(this.apiUrl).hostname;
    } catch {
      return 'transcrição';
    }
  }
}

function transcriptionText(data: Record<string, any> | null) {
  if (typeof data?.text === 'string') return data.text.trim();
  return typeof data?.transcription === 'string' ? data.transcription.trim() : '';
}
