import { afterEach, describe, expect, it, vi } from 'vitest';
import { OllamaClient } from './ollama-client.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('cliente do Ollama', () => {
  it('solicita JSON estruturado sem streaming e preserva as métricas', async () => {
    vi.stubEnv('AI_ASSISTANT_ENABLED', 'true');
    vi.stubEnv('OLLAMA_API_URL', 'https://ollama.test');
    vi.stubEnv('OLLAMA_MODEL', 'qwen3:4b-instruct');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: 'qwen3:4b-instruct',
      message: { content: '{"reply":"Olá!"}' },
      prompt_eval_count: 12,
      eval_count: 4,
      total_duration: 2_500_000,
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new OllamaClient().generate<{ reply: string }>({
      system: 'Sistema',
      prompt: 'Usuário',
      schema: { type: 'object' },
      timeoutMs: 1_000,
      validate: (value) => value,
    });

    expect(result).toEqual({
      data: { reply: 'Olá!' },
      model: 'qwen3:4b-instruct',
      metrics: { promptEvalCount: 12, evalCount: 4, totalDurationMs: 3 },
    });
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(fetchMock).toHaveBeenCalledWith('https://ollama.test/api/chat', expect.objectContaining({ method: 'POST' }));
    expect(request).toMatchObject({ model: 'qwen3:4b-instruct', stream: false, think: false, keep_alive: '2m', format: { type: 'object' } });
  });

  it('rejeita a saída quando o validador estrutural não a aceita', async () => {
    vi.stubEnv('AI_ASSISTANT_ENABLED', 'true');
    vi.stubEnv('OLLAMA_API_URL', 'https://ollama.test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: { content: '{"unexpected":true}' } }), { status: 200 })));
    await expect(new OllamaClient().generate({
      system: 'Sistema', prompt: 'Usuário', schema: {}, timeoutMs: 1_000,
      validate: () => { throw new Error('estrutura inválida'); },
    })).rejects.toThrow('estrutura inválida');
  });

  it('não chama o serviço quando a funcionalidade está desativada', async () => {
    vi.stubEnv('AI_ASSISTANT_ENABLED', 'false');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(new OllamaClient().generate({ system: '', prompt: '', schema: {}, timeoutMs: 100 })).rejects.toThrow(/desativado/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
