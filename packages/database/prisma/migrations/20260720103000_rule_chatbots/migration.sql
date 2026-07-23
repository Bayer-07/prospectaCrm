CREATE TYPE "ChatbotSessionStatus" AS ENUM ('ACTIVE', 'WAITING', 'COMPLETED', 'HANDED_OFF', 'STOPPED', 'FAILED');

CREATE TABLE "Chatbot" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "instanceId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "responseProvider" TEXT NOT NULL DEFAULT 'RULES',
    "providerConfig" JSONB NOT NULL DEFAULT '{}',
    "publishedVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Chatbot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatbotVersion" (
    "id" UUID NOT NULL,
    "chatbotId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "graph" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatbotVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatbotSession" (
    "id" UUID NOT NULL,
    "chatbotId" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "status" "ChatbotSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentNodeId" TEXT,
    "lastInboundMessageId" UUID,
    "context" JSONB NOT NULL DEFAULT '{}',
    "stopReason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "ChatbotSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatbotStepExecution" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "nodeId" TEXT NOT NULL,
    "inboundMessageId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "input" JSONB NOT NULL DEFAULT '{}',
    "output" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "ChatbotStepExecution_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Chatbot_organizationId_status_updatedAt_idx" ON "Chatbot"("organizationId", "status", "updatedAt");
CREATE INDEX "Chatbot_instanceId_status_idx" ON "Chatbot"("instanceId", "status");
CREATE UNIQUE INDEX "ChatbotVersion_chatbotId_version_key" ON "ChatbotVersion"("chatbotId", "version");
CREATE UNIQUE INDEX "ChatbotSession_conversationId_key" ON "ChatbotSession"("conversationId");
CREATE INDEX "ChatbotSession_chatbotId_status_idx" ON "ChatbotSession"("chatbotId", "status");
CREATE INDEX "ChatbotSession_status_updatedAt_idx" ON "ChatbotSession"("status", "updatedAt");
CREATE UNIQUE INDEX "ChatbotStepExecution_sessionId_nodeId_inboundMessageId_key" ON "ChatbotStepExecution"("sessionId", "nodeId", "inboundMessageId");
CREATE INDEX "ChatbotStepExecution_sessionId_startedAt_idx" ON "ChatbotStepExecution"("sessionId", "startedAt");

ALTER TABLE "Chatbot" ADD CONSTRAINT "Chatbot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Chatbot" ADD CONSTRAINT "Chatbot_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "WhatsappInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Chatbot" ADD CONSTRAINT "Chatbot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChatbotVersion" ADD CONSTRAINT "ChatbotVersion_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatbotSession" ADD CONSTRAINT "ChatbotSession_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatbotSession" ADD CONSTRAINT "ChatbotSession_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ChatbotVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChatbotSession" ADD CONSTRAINT "ChatbotSession_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatbotStepExecution" ADD CONSTRAINT "ChatbotStepExecution_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatbotSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
