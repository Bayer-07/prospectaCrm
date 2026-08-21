import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiKnowledgeProcessor } from './ai-knowledge.processor.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('indexação da base de conhecimento', () => {
  it('marca como pronto um arquivo que a OpenAI terminou de indexar', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('OPENAI_API_URL', 'https://openai.test/v1');
    const document = {
      id: 'document-1', organizationId: 'org-1', mediaAssetId: 'asset-1', status: 'INDEXING',
      openAiFileId: 'file-1', openAiVectorFileId: 'file-1',
      mediaAsset: { id: 'asset-1', key: 'org-1/manual.pdf', filename: 'manual.pdf', contentType: 'application/pdf', sizeBytes: 100 },
      organization: { aiSettings: { openAiApiKeyEncrypted: null } },
    };
    const update = vi.fn().mockResolvedValue({});
    const db = {
      aiKnowledgeDocument: { findUnique: vi.fn().mockResolvedValue(document), update },
      organizationAiSettings: { findUnique: vi.fn().mockResolvedValue({ openAiVectorStoreId: 'vs-1' }) },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'file-1', status: 'completed' }), { status: 200 })));
    const processor = new AiKnowledgeProcessor(db as never, {} as never);

    await expect(processor.process({ data: { documentId: 'document-1', action: 'index' } } as never)).resolves.toMatchObject({
      organizationId: 'org-1', event: 'ai.knowledge.updated', payload: { documentId: 'document-1', status: 'READY' },
    });
    expect(update).toHaveBeenCalledWith({ where: { id: 'document-1' }, data: expect.objectContaining({ status: 'READY', error: null }) });
  });

  it('reconcilia somente documentos pendentes antigos', async () => {
    const updatedAt = new Date(Date.now() - 60_000);
    const db = { aiKnowledgeDocument: { findMany: vi.fn().mockResolvedValue([{ id: 'document-1', status: 'INDEXING', updatedAt }]) } };
    const queue = { add: vi.fn().mockResolvedValue({}) };
    const processor = new AiKnowledgeProcessor(db as never, queue as never);

    await expect(processor.reconcile()).resolves.toEqual({ scheduled: 1 });
    expect(db.aiKnowledgeDocument.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: { in: ['INDEXING', 'DELETING'] }, updatedAt: { lt: expect.any(Date) } },
    }));
    expect(queue.add).toHaveBeenCalledWith('sync-document', { documentId: 'document-1', action: 'index' }, expect.objectContaining({
      jobId: `ai-knowledge-reconcile-document-1-${updatedAt.getTime()}`,
    }));
  });

  it('ignora um job antigo de exclusão quando o documento não está mais sendo removido', async () => {
    const document = {
      id: 'document-1', organizationId: 'org-1', mediaAssetId: 'asset-1', status: 'READY',
      openAiFileId: 'file-1', openAiVectorFileId: 'file-1',
      mediaAsset: { id: 'asset-1', key: 'org-1/manual.pdf', filename: 'manual.pdf', contentType: 'application/pdf', sizeBytes: 100 },
      organization: { aiSettings: { openAiApiKeyEncrypted: null } },
    };
    const db = {
      aiKnowledgeDocument: { findUnique: vi.fn().mockResolvedValue(document) },
      mediaAsset: { delete: vi.fn() },
      $transaction: vi.fn(),
    };
    const processor = new AiKnowledgeProcessor(db as never, {} as never);

    await expect(processor.process({ data: { documentId: 'document-1', action: 'delete' } } as never)).resolves.toBeUndefined();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.mediaAsset.delete).not.toHaveBeenCalled();
  });
});
