CREATE TYPE "AiGenerationType" AS ENUM ('SUMMARY', 'REPLY_SUGGESTION', 'CHATBOT_REPLY', 'CONFIG_TEST');
CREATE TYPE "AiGenerationStatus" AS ENUM ('PENDING', 'WAITING_INPUT', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'STALE');
CREATE TYPE "AiSummaryScope" AS ENUM ('CURRENT_ATTENDANCE', 'FULL_CONVERSATION');
CREATE TYPE "AiProposalStatus" AS ENUM ('PENDING', 'PARTIALLY_APPLIED', 'APPLIED', 'DISMISSED');

CREATE TABLE "OrganizationAiSettings" (
  "organizationId" UUID NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "globalInstructions" TEXT NOT NULL DEFAULT '',
  "fallbackMessage" TEXT NOT NULL DEFAULT 'No momento não consegui continuar o atendimento automático. Vou encaminhar você para nossa equipe.',
  "updatedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationAiSettings_pkey" PRIMARY KEY ("organizationId")
);

CREATE TABLE "ConversationAiGeneration" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "conversationId" UUID,
  "requestedById" UUID,
  "chatbotSessionId" UUID,
  "type" "AiGenerationType" NOT NULL,
  "status" "AiGenerationStatus" NOT NULL DEFAULT 'PENDING',
  "scope" "AiSummaryScope",
  "deduplicationKey" TEXT NOT NULL,
  "sourceFirstMessageId" UUID,
  "sourceLastMessageId" UUID,
  "input" JSONB NOT NULL DEFAULT '{}',
  "result" JSONB,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "model" TEXT,
  "error" TEXT,
  "promptEvalCount" INTEGER,
  "evalCount" INTEGER,
  "totalDurationMs" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "ConversationAiGeneration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversationAiProposal" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "conversationId" UUID NOT NULL,
  "contactId" UUID NOT NULL,
  "generationId" UUID NOT NULL,
  "status" "AiProposalStatus" NOT NULL DEFAULT 'PENDING',
  "changes" JSONB NOT NULL,
  "appliedFields" JSONB NOT NULL DEFAULT '[]',
  "appliedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "appliedAt" TIMESTAMP(3),
  CONSTRAINT "ConversationAiProposal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConversationAiGeneration_deduplicationKey_key" ON "ConversationAiGeneration"("deduplicationKey");
CREATE INDEX "AiGeneration_status_created_idx" ON "ConversationAiGeneration"("status", "createdAt");
CREATE INDEX "AiGeneration_status_updated_idx" ON "ConversationAiGeneration"("status", "updatedAt");
CREATE INDEX "AiGeneration_conversation_type_recent_idx" ON "ConversationAiGeneration"("conversationId", "type", "createdAt" DESC);
CREATE INDEX "ConversationAiGeneration_chatbotSessionId_status_idx" ON "ConversationAiGeneration"("chatbotSessionId", "status");
CREATE UNIQUE INDEX "ConversationAiProposal_generationId_key" ON "ConversationAiProposal"("generationId");
CREATE INDEX "AiProposal_conversation_status_recent_idx" ON "ConversationAiProposal"("conversationId", "status", "createdAt" DESC);
CREATE INDEX "ConversationAiProposal_contactId_status_idx" ON "ConversationAiProposal"("contactId", "status");

ALTER TABLE "OrganizationAiSettings" ADD CONSTRAINT "OrganizationAiSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationAiSettings" ADD CONSTRAINT "OrganizationAiSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConversationAiGeneration" ADD CONSTRAINT "ConversationAiGeneration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationAiGeneration" ADD CONSTRAINT "ConversationAiGeneration_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationAiGeneration" ADD CONSTRAINT "ConversationAiGeneration_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConversationAiGeneration" ADD CONSTRAINT "ConversationAiGeneration_chatbotSessionId_fkey" FOREIGN KEY ("chatbotSessionId") REFERENCES "ChatbotSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationAiProposal" ADD CONSTRAINT "ConversationAiProposal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationAiProposal" ADD CONSTRAINT "ConversationAiProposal_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationAiProposal" ADD CONSTRAINT "ConversationAiProposal_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationAiProposal" ADD CONSTRAINT "ConversationAiProposal_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "ConversationAiGeneration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationAiProposal" ADD CONSTRAINT "ConversationAiProposal_appliedById_fkey" FOREIGN KEY ("appliedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
