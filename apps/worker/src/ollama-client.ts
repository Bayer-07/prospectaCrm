export type OllamaMetrics = {
  promptEvalCount?: number;
  evalCount?: number;
  totalDurationMs?: number;
};

export type OllamaResult<T> = { data: T; model: string; metrics: OllamaMetrics };

type GenerateOptions = {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  timeoutMs: number;
  keepAlive?: string;
  validate?: (value: unknown) => unknown;
};

type OllamaResponse = {
  model?: string;
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
  total_duration?: number;
};

export class OllamaClient {
  readonly model = process.env.OLLAMA_MODEL || 'qwen3:4b-instruct';

  async generate<T>(options: GenerateOptions): Promise<OllamaResult<T>> {
    if (process.env.AI_ASSISTANT_ENABLED !== 'true') throw new Error('O assistente de IA está desativado');
    const baseUrl = process.env.OLLAMA_API_URL?.replace(/\/$/, '');
    if (!baseUrl) throw new Error('OLLAMA_API_URL não está configurada');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          stream: false,
          think: false,
          keep_alive: options.keepAlive || process.env.OLLAMA_KEEP_ALIVE || '2m',
          format: options.schema,
          messages: [
            { role: 'system', content: options.system },
            { role: 'user', content: options.prompt },
          ],
          options: {
            num_ctx: Math.max(2_048, Number(process.env.OLLAMA_CONTEXT_LENGTH) || 4_096),
            temperature: 0.2,
          },
        }),
      });
      const raw = await response.text();
      if (!response.ok) throw new Error(`Ollama ${response.status}: ${raw.slice(0, 500)}`);
      const payload = JSON.parse(raw) as OllamaResponse;
      const content = payload.message?.content?.trim();
      if (!content) throw new Error('O Ollama retornou uma resposta vazia');
      const decoded: unknown = JSON.parse(content);
      return {
        data: (options.validate ? options.validate(decoded) : decoded) as T,
        model: payload.model || this.model,
        metrics: {
          promptEvalCount: payload.prompt_eval_count,
          evalCount: payload.eval_count,
          totalDurationMs: payload.total_duration ? Math.round(payload.total_duration / 1_000_000) : undefined,
        },
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new Error('A geração excedeu o tempo limite');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
