import type { Job, Queue } from 'bullmq';
import type { PrismaClient } from '@prisma/client';
import { deleteStoredMedia, storedMediaBuffer } from './storage.js';
import { decryptSecret } from './secret-crypto.js';
import { OpenAiKnowledgeClient, type VectorStoreFile } from './openai-knowledge-client.js';

type KnowledgeJob = { documentId: string; action: 'index' | 'poll' | 'retry' | 'delete'; pollAttempt?: number };

export class AiKnowledgeProcessor {
  constructor(private readonly db: PrismaClient, private readonly queue: Queue) {}

  async reconcile() {
    const staleBefore = new Date(Date.now() - 20_000);
    const documents = await this.db.aiKnowledgeDocument.findMany({
      where: { status: { in: ['INDEXING', 'DELETING'] }, updatedAt: { lt: staleBefore } },
      select: { id: true, status: true, updatedAt: true },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: 500,
    });
    await Promise.all(documents.map((document) => this.queue.add('sync-document', {
      documentId: document.id,
      action: document.status === 'DELETING' ? 'delete' : 'index',
    }, {
      jobId: `ai-knowledge-reconcile-${document.id}-${document.updatedAt.getTime()}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
    })));
    return { scheduled: documents.length };
  }

  async process(job: Job<KnowledgeJob>) {
    const document = await this.loadDocument(job.data.documentId);
    if (!document) return;
    if (job.data.action === 'delete') {
      if (document.status !== 'DELETING') return;
      try { return await this.deleteDocument(document); }
      catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        await this.db.aiKnowledgeDocument.updateMany({ where: { id: document.id, status: 'DELETING' }, data: { error: reason.slice(0, 2_000) } });
        throw error;
      }
    }
    if (document.status !== 'INDEXING') return;
    try {
      const client = this.client(document.organization.aiSettings);
      if (job.data.action === 'retry') await this.resetRemoteDocument(client, document);
      const refreshed = await this.loadDocument(document.id);
      if (!refreshed || refreshed.status !== 'INDEXING') return;
      const vectorStoreId = await this.ensureVectorStore(refreshed.organizationId, client);
      if (refreshed.openAiFileId && refreshed.openAiVectorFileId) {
        return this.syncStatus(refreshed.id, vectorStoreId, refreshed.openAiVectorFileId, client, job.data.pollAttempt || 0);
      }
      const bytes = await storedMediaBuffer(refreshed.mediaAsset.key, 25 * 1024 * 1024);
      const file = await client.uploadFile({
        filename: refreshed.mediaAsset.filename,
        contentType: refreshed.mediaAsset.contentType,
        bytes,
      });
      const stillIndexing = await this.db.aiKnowledgeDocument.findFirst({ where: { id: refreshed.id, status: 'INDEXING' }, select: { id: true } });
      if (!stillIndexing) {
        await client.deleteFile(file.id).catch(() => undefined);
        return;
      }
      const attached = await client.attachFile(vectorStoreId, file.id, refreshed.id);
      const saved = await this.db.aiKnowledgeDocument.updateMany({
        where: { id: refreshed.id, status: 'INDEXING' },
        data: { openAiFileId: file.id, openAiVectorFileId: attached.id, error: null },
      });
      if (!saved.count) {
        await client.deleteFile(file.id).catch(() => undefined);
        return;
      }
      return this.syncStatus(refreshed.id, vectorStoreId, attached.id, client, 0, attached);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const maxAttempts = Number(job.opts.attempts) || 1;
      if (job.attemptsMade + 1 < maxAttempts) {
        await this.db.aiKnowledgeDocument.updateMany({
          where: { id: document.id, status: 'INDEXING' },
          data: { error: reason.slice(0, 2_000) },
        });
        throw error;
      }
      await this.db.aiKnowledgeDocument.updateMany({
        where: { id: document.id, status: 'INDEXING' },
        data: { status: 'FAILED', error: reason.slice(0, 2_000) },
      });
      return this.event(document.organizationId, document.id, 'FAILED');
    }
  }

  private loadDocument(id: string) {
    return this.db.aiKnowledgeDocument.findUnique({
      where: { id },
      include: {
        mediaAsset: true,
        organization: { include: { aiSettings: true } },
      },
    });
  }

  private client(settings: { openAiApiKeyEncrypted: string | null } | null) {
    const apiKey = settings?.openAiApiKeyEncrypted
      ? decryptSecret(settings.openAiApiKeyEncrypted)
      : process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) throw new Error('A chave da OpenAI não está configurada para indexar documentos');
    return new OpenAiKnowledgeClient(apiKey);
  }

  private async ensureVectorStore(organizationId: string, client: OpenAiKnowledgeClient) {
    const current = await this.db.organizationAiSettings.findUnique({
      where: { organizationId },
      select: { openAiVectorStoreId: true },
    });
    if (current?.openAiVectorStoreId) return current.openAiVectorStoreId;
    const created = await client.createVectorStore(organizationId);
    const claimed = await this.db.organizationAiSettings.updateMany({
      where: { organizationId, openAiVectorStoreId: null },
      data: { openAiVectorStoreId: created.id },
    });
    if (claimed.count) return created.id;
    await client.deleteVectorStore(created.id).catch(() => undefined);
    const winner = await this.db.organizationAiSettings.findUnique({
      where: { organizationId },
      select: { openAiVectorStoreId: true },
    });
    if (!winner?.openAiVectorStoreId) throw new Error('Não foi possível preparar a base vetorial da organização');
    return winner.openAiVectorStoreId;
  }

  private async syncStatus(
    documentId: string,
    vectorStoreId: string,
    vectorFileId: string,
    client: OpenAiKnowledgeClient,
    pollAttempt: number,
    known?: VectorStoreFile,
  ) {
    const remote = known || await client.getVectorStoreFile(vectorStoreId, vectorFileId);
    const document = await this.db.aiKnowledgeDocument.findUnique({ where: { id: documentId }, select: { organizationId: true, status: true } });
    if (!document || document.status !== 'INDEXING') return;
    if (remote.status === 'completed') {
      await this.db.aiKnowledgeDocument.update({ where: { id: documentId }, data: { status: 'READY', error: null, indexedAt: new Date() } });
      return this.event(document.organizationId, documentId, 'READY');
    }
    if (remote.status === 'failed' || remote.status === 'cancelled') {
      const reason = remote.last_error?.message || `A OpenAI encerrou a indexação com o estado ${remote.status}`;
      await this.db.aiKnowledgeDocument.update({ where: { id: documentId }, data: { status: 'FAILED', error: reason.slice(0, 2_000) } });
      return this.event(document.organizationId, documentId, 'FAILED');
    }
    if (pollAttempt >= 100) {
      await this.db.aiKnowledgeDocument.update({ where: { id: documentId }, data: { status: 'FAILED', error: 'A indexação não terminou dentro de 5 minutos' } });
      return this.event(document.organizationId, documentId, 'FAILED');
    }
    await this.queue.add('sync-document', { documentId, action: 'poll', pollAttempt: pollAttempt + 1 }, {
      jobId: `ai-knowledge-poll-${documentId}-${pollAttempt + 1}`,
      delay: 3_000,
      attempts: 3,
      backoff: { type: 'exponential', delay: 3_000 },
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
    });
    return this.event(document.organizationId, documentId, 'INDEXING');
  }

  private async resetRemoteDocument(client: OpenAiKnowledgeClient, document: Awaited<ReturnType<AiKnowledgeProcessor['loadDocument']>>) {
    if (!document) return;
    if (document.openAiFileId) await client.deleteFile(document.openAiFileId).catch(() => undefined);
    await this.db.aiKnowledgeDocument.update({
      where: { id: document.id },
      data: { openAiFileId: null, openAiVectorFileId: null, error: null, indexedAt: null },
    });
  }

  private async deleteDocument(document: NonNullable<Awaited<ReturnType<AiKnowledgeProcessor['loadDocument']>>>) {
    if (document.openAiFileId) await this.client(document.organization.aiSettings).deleteFile(document.openAiFileId);
    await deleteStoredMedia([document.mediaAsset.key]);
    await this.db.$transaction([
      this.db.aiKnowledgeDocument.delete({ where: { id: document.id } }),
      this.db.mediaAsset.delete({ where: { id: document.mediaAssetId } }),
    ]);
    return this.event(document.organizationId, document.id, 'DELETED');
  }

  private event(organizationId: string, documentId: string, status: string) {
    return { organizationId, event: 'ai.knowledge.updated', payload: { documentId, status } };
  }
}
