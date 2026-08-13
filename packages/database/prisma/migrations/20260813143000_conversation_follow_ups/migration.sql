CREATE TYPE "FollowUpMode" AS ENUM ('MESSAGE_SEQUENCE', 'WORKFLOW');
CREATE TYPE "FollowUpStatus" AS ENUM ('SCHEDULED', 'RUNNING', 'COMPLETED', 'CANCELLED', 'INTERRUPTED', 'FAILED');
CREATE TYPE "FollowUpStepStatus" AS ENUM ('PENDING', 'QUEUED', 'SENT', 'CANCELLED', 'FAILED');

CREATE TABLE "ConversationFollowUp" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "responsibleId" UUID NOT NULL,
    "workflowVersionId" UUID,
    "workflowEnrollmentId" UUID,
    "mode" "FollowUpMode" NOT NULL,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConversationFollowUp_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversationFollowUpStep" (
    "id" UUID NOT NULL,
    "followUpId" UUID NOT NULL,
    "messageId" UUID,
    "position" INTEGER NOT NULL,
    "text" TEXT,
    "messageType" TEXT NOT NULL DEFAULT 'text',
    "mediaKey" TEXT,
    "mediaName" TEXT,
    "mediaType" TEXT,
    "delaySeconds" INTEGER NOT NULL DEFAULT 0,
    "status" "FollowUpStepStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConversationFollowUpStep_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConversationFollowUp_taskId_key" ON "ConversationFollowUp"("taskId");
CREATE UNIQUE INDEX "ConversationFollowUp_workflowEnrollmentId_key" ON "ConversationFollowUp"("workflowEnrollmentId");
CREATE UNIQUE INDEX "FollowUp_one_active_per_conversation_idx"
    ON "ConversationFollowUp"("conversationId")
    WHERE "status" IN ('SCHEDULED', 'RUNNING');
CREATE INDEX "FollowUp_org_status_due_idx" ON "ConversationFollowUp"("organizationId", "status", "scheduledAt");
CREATE INDEX "FollowUp_conversation_status_idx" ON "ConversationFollowUp"("conversationId", "status");
CREATE INDEX "FollowUp_responsible_status_due_idx" ON "ConversationFollowUp"("responsibleId", "status", "scheduledAt");

CREATE UNIQUE INDEX "ConversationFollowUpStep_messageId_key" ON "ConversationFollowUpStep"("messageId");
CREATE UNIQUE INDEX "ConversationFollowUpStep_followUpId_position_key" ON "ConversationFollowUpStep"("followUpId", "position");
CREATE INDEX "FollowUpStep_followup_status_position_idx" ON "ConversationFollowUpStep"("followUpId", "status", "position");
CREATE INDEX "FollowUpStep_status_due_idx" ON "ConversationFollowUpStep"("status", "scheduledAt");

ALTER TABLE "ConversationFollowUp" ADD CONSTRAINT "ConversationFollowUp_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationFollowUp" ADD CONSTRAINT "ConversationFollowUp_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationFollowUp" ADD CONSTRAINT "ConversationFollowUp_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationFollowUp" ADD CONSTRAINT "ConversationFollowUp_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConversationFollowUp" ADD CONSTRAINT "ConversationFollowUp_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConversationFollowUp" ADD CONSTRAINT "ConversationFollowUp_workflowVersionId_fkey" FOREIGN KEY ("workflowVersionId") REFERENCES "WorkflowVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConversationFollowUp" ADD CONSTRAINT "ConversationFollowUp_workflowEnrollmentId_fkey" FOREIGN KEY ("workflowEnrollmentId") REFERENCES "WorkflowEnrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConversationFollowUpStep" ADD CONSTRAINT "ConversationFollowUpStep_followUpId_fkey" FOREIGN KEY ("followUpId") REFERENCES "ConversationFollowUp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationFollowUpStep" ADD CONSTRAINT "ConversationFollowUpStep_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
