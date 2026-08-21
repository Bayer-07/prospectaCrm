type VectorStore = { id: string };
type OpenAiFile = { id: string };
export type VectorStoreFile = {
  id: string;
  status: 'in_progress' | 'completed' | 'failed' | 'cancelled';
  last_error?: { code?: string; message?: string } | null;
};

export class OpenAiKnowledgeClient {
  private readonly baseUrl = (process.env.OPENAI_API_URL || 'https://api.openai.com/v1').replace(/\/$/, '');

  constructor(private readonly apiKey: string) {}

  createVectorStore(organizationId: string) {
    return this.json<VectorStore>('/vector_stores', {
      method: 'POST',
      body: JSON.stringify({
        name: `BZS One · Base de conhecimento · ${organizationId}`,
        description: 'Documentos institucionais usados como contexto nas respostas do BZS One.',
        metadata: { organization_id: organizationId },
      }),
    });
  }

  deleteVectorStore(vectorStoreId: string) {
    return this.json(`/vector_stores/${encodeURIComponent(vectorStoreId)}`, { method: 'DELETE' }, true);
  }

  async uploadFile(input: { filename: string; contentType: string; bytes: Buffer }) {
    const form = new FormData();
    form.set('purpose', 'assistants');
    const body = input.bytes.buffer.slice(input.bytes.byteOffset, input.bytes.byteOffset + input.bytes.byteLength) as ArrayBuffer;
    form.set('file', new Blob([body], { type: input.contentType }), input.filename);
    return this.json<OpenAiFile>('/files', { method: 'POST', body: form });
  }

  attachFile(vectorStoreId: string, fileId: string, documentId: string) {
    return this.json<VectorStoreFile>(`/vector_stores/${encodeURIComponent(vectorStoreId)}/files`, {
      method: 'POST',
      body: JSON.stringify({
        file_id: fileId,
        attributes: { bzs_document_id: documentId },
        chunking_strategy: { type: 'auto' },
      }),
    });
  }

  getVectorStoreFile(vectorStoreId: string, fileId: string) {
    return this.json<VectorStoreFile>(`/vector_stores/${encodeURIComponent(vectorStoreId)}/files/${encodeURIComponent(fileId)}`);
  }

  deleteFile(fileId: string) {
    return this.json(`/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' }, true);
  }

  private async json<T = unknown>(path: string, init: RequestInit = {}, allowMissing = false): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      const isForm = init.body instanceof FormData;
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          ...(isForm ? {} : { 'content-type': 'application/json' }),
          ...(path.startsWith('/vector_stores') ? { 'OpenAI-Beta': 'assistants=v2' } : {}),
          ...init.headers,
        },
      });
      const raw = await response.text();
      if (allowMissing && response.status === 404) return {} as T;
      let payload: unknown;
      try { payload = raw ? JSON.parse(raw) : {}; }
      catch { throw new Error(`OpenAI ${response.status}: resposta inválida`); }
      if (!response.ok) {
        const error = payload && typeof payload === 'object' && 'error' in payload
          ? (payload as { error?: { message?: string } }).error?.message
          : undefined;
        throw new Error(`OpenAI ${response.status}: ${error || raw.slice(0, 500)}`);
      }
      return payload as T;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new Error('A indexação na OpenAI excedeu o tempo limite');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
