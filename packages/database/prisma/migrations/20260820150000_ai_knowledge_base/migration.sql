CREATE TYPE "AiKnowledgeDocumentStatus" AS ENUM ('INDEXING', 'READY', 'FAILED', 'DELETING');

ALTER TABLE "OrganizationAiSettings"
ADD COLUMN "openAiVectorStoreId" TEXT;

CREATE TABLE "AiKnowledgeDocument" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "mediaAssetId" UUID NOT NULL,
    "createdById" UUID,
    "status" "AiKnowledgeDocumentStatus" NOT NULL DEFAULT 'INDEXING',
    "openAiFileId" TEXT,
    "openAiVectorFileId" TEXT,
    "error" TEXT,
    "indexedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiKnowledgeDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiKnowledgeDocument_mediaAssetId_key" ON "AiKnowledgeDocument"("mediaAssetId");
CREATE INDEX "AiKnowledgeDocument_org_status_created_idx" ON "AiKnowledgeDocument"("organizationId", "status", "createdAt" DESC);
CREATE INDEX "AiKnowledgeDocument_status_updated_idx" ON "AiKnowledgeDocument"("status", "updatedAt");

ALTER TABLE "AiKnowledgeDocument"
ADD CONSTRAINT "AiKnowledgeDocument_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiKnowledgeDocument"
ADD CONSTRAINT "AiKnowledgeDocument_mediaAssetId_fkey"
FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AiKnowledgeDocument"
ADD CONSTRAINT "AiKnowledgeDocument_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
