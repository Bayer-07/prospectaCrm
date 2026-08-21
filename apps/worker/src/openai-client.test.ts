import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAiClient } from './openai-client.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('cliente da OpenAI', () => {
  it('usa Responses API com JSON estruturado, sem persistir a resposta', async () => {
    vi.stubEnv('AI_ASSISTANT_ENABLED', 'true');
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('OPENAI_API_URL', 'https://openai.test/v1');
    vi.stubEnv('OPENAI_MODEL', 'gpt-5.6-luna');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: 'gpt-5.6-luna',
      status: 'completed',
      output: [{ content: [{ type: 'output_text', text: '{"reply":"Olá!"}' }] }],
      usage: { input_tokens: 12, output_tokens: 4 },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new OpenAiClient().generate<{ reply: string }>({
      system: 'Sistema',
      prompt: 'Usuário',
      schema: { type: 'object' },
      apiKey: 'organization-key',
      model: 'gpt-5.6-terra',
      timeoutMs: 1_000,
      maxTokens: 160,
      validate: (value) => value,
    });

    expect(result).toMatchObject({
      data: { reply: 'Olá!' },
      model: 'gpt-5.6-luna',
      metrics: { promptEvalCount: 12, evalCount: 4 },
      sources: [],
    });
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(fetchMock).toHaveBeenCalledWith('https://openai.test/v1/responses', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ authorization: 'Bearer organization-key' }),
    }));
    expect(request).toMatchObject({
      model: 'gpt-5.6-terra',
      store: false,
      instructions: 'Sistema',
      input: 'Usuário',
      reasoning: { effort: 'none' },
      text: { verbosity: 'low', format: { type: 'json_schema', name: 'bzs_one_structured_response', strict: true, schema: { type: 'object' } } },
      max_output_tokens: 160,
    });
  });

  it('habilita o file search e devolve as fontes consultadas', async () => {
    vi.stubEnv('AI_ASSISTANT_ENABLED', 'true');
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'completed',
      output: [
        { type: 'file_search_call', results: [{ file_id: 'file-1', filename: 'catalogo.pdf', score: 0.92 }] },
        { type: 'message', content: [{ type: 'output_text', text: '{"reply":"Resposta baseada no catálogo"}' }] },
      ],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new OpenAiClient().generate<{ reply: string }>({
      system: 'Sistema', prompt: 'Usuário', schema: { type: 'object' }, timeoutMs: 1_000, vectorStoreId: 'vs-1',
    });

    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(request).toMatchObject({
      tools: [{ type: 'file_search', vector_store_ids: ['vs-1'], max_num_results: 5 }],
      include: ['file_search_call.results'],
    });
    expect(result.sources).toEqual([{ fileId: 'file-1', filename: 'catalogo.pdf', score: 0.92 }]);
  });

  it('rejeita a saída quando o validador estrutural não a aceita', async () => {
    vi.stubEnv('AI_ASSISTANT_ENABLED', 'true');
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: '{"unexpected":true}' }), { status: 200 })));
    await expect(new OpenAiClient().generate({
      system: 'Sistema', prompt: 'Usuário', schema: {}, timeoutMs: 1_000,
      validate: () => { throw new Error('estrutura inválida'); },
    })).rejects.toThrow('estrutura inválida');
  });

  it('não chama a API sem uma chave configurada', async () => {
    vi.stubEnv('AI_ASSISTANT_ENABLED', 'true');
    vi.stubEnv('OPENAI_API_KEY', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(new OpenAiClient().generate({ system: '', prompt: '', schema: {}, timeoutMs: 100 })).rejects.toThrow(/OPENAI_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
