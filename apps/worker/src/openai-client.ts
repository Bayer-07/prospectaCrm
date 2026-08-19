export type AiMetrics = {
  promptEvalCount?: number;
  evalCount?: number;
  totalDurationMs?: number;
};

export type AiResult<T> = { data: T; model: string; metrics: AiMetrics };

export type GenerateOptions = {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  timeoutMs: number;
  maxTokens?: number;
  validate?: (value: unknown) => unknown;
};

type OpenAiResponse = {
  model?: string;
  status?: string;
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
  incomplete_details?: { reason?: string };
};

function responseText(payload: OpenAiResponse) {
  if (payload.output_text?.trim()) return payload.output_text.trim();
  for (const item of payload.output || []) {
    const text = item.content?.find((content) => content.type === 'output_text' && content.text)?.text;
    if (text?.trim()) return text.trim();
  }
  return '';
}

export class OpenAiClient {
  readonly model = process.env.OPENAI_MODEL || 'gpt-5.6-luna';

  async generate<T>(options: GenerateOptions): Promise<AiResult<T>> {
    if (process.env.AI_ASSISTANT_ENABLED !== 'true') throw new Error('O assistente de IA está desativado');
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) throw new Error('OPENAI_API_KEY não está configurada');
    const baseUrl = (process.env.OPENAI_API_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    const startedAt = performance.now();
    try {
      const response = await fetch(`${baseUrl}/responses`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          store: false,
          instructions: options.system,
          input: options.prompt,
          reasoning: { effort: process.env.OPENAI_REASONING_EFFORT || 'none' },
          text: {
            verbosity: 'low',
            format: {
              type: 'json_schema',
              name: 'bzs_one_structured_response',
              strict: true,
              schema: options.schema,
            },
          },
          ...(options.maxTokens ? { max_output_tokens: Math.min(4_096, Math.max(32, Math.floor(options.maxTokens))) } : {}),
        }),
      });
      const raw = await response.text();
      let payload: OpenAiResponse;
      try {
        payload = JSON.parse(raw) as OpenAiResponse;
      } catch {
        throw new Error(`OpenAI ${response.status}: resposta inválida`);
      }
      if (!response.ok) throw new Error(`OpenAI ${response.status}: ${payload.error?.message || raw.slice(0, 500)}`);
      if (payload.status === 'incomplete') throw new Error(`A OpenAI não concluiu a geração: ${payload.incomplete_details?.reason || 'motivo desconhecido'}`);
      const content = responseText(payload);
      if (!content) throw new Error('A OpenAI retornou uma resposta vazia');
      const decoded: unknown = JSON.parse(content);
      return {
        data: (options.validate ? options.validate(decoded) : decoded) as T,
        model: payload.model || this.model,
        metrics: {
          promptEvalCount: payload.usage?.input_tokens,
          evalCount: payload.usage?.output_tokens,
          totalDurationMs: Math.round(performance.now() - startedAt),
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
