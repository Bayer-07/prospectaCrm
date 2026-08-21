import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAiKnowledgeClient } from './openai-knowledge-client.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('cliente da base de conhecimento da OpenAI', () => {
  it('cria a base vetorial com o escopo da organização', async () => {
    vi.stubEnv('OPENAI_API_URL', 'https://openai.test/v1');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'vs-1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(new OpenAiKnowledgeClient('organization-key').createVectorStore('org-1')).resolves.toEqual({ id: 'vs-1' });

    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(fetchMock).toHaveBeenCalledWith('https://openai.test/v1/vector_stores', expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ authorization: 'Bearer organization-key' }),
    }));
    expect(request).toMatchObject({ metadata: { organization_id: 'org-1' } });
  });

  it('envia o arquivo e o vincula ao índice com chunking automático', async () => {
    vi.stubEnv('OPENAI_API_URL', 'https://openai.test/v1');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'file-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'file-1', status: 'in_progress' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new OpenAiKnowledgeClient('organization-key');

    await expect(client.uploadFile({ filename: 'manual.txt', contentType: 'text/plain', bytes: Buffer.from('conteúdo') })).resolves.toEqual({ id: 'file-1' });
    await expect(client.attachFile('vs-1', 'file-1', 'document-1')).resolves.toMatchObject({ status: 'in_progress' });

    const uploadBody = fetchMock.mock.calls[0][1]?.body;
    expect(uploadBody).toBeInstanceOf(FormData);
    expect((uploadBody as FormData).get('purpose')).toBe('assistants');
    const attachBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(attachBody).toEqual({
      file_id: 'file-1', attributes: { bzs_document_id: 'document-1' }, chunking_strategy: { type: 'auto' },
    });
  });
});
