-- Align list, queue and pagination indexes with the filters and sort order
-- used by the API. Replacing the old indexes avoids keeping redundant write
-- overhead while preserving the same data constraints.

DROP INDEX IF EXISTS "Company_organizationId_teamId_ownerId_idx";
DROP INDEX IF EXISTS "Company_organizationId_archivedAt_updatedAt_idx";
CREATE INDEX "Company_team_scope_list_idx"
  ON "Company"("organizationId", "teamId", "archivedAt", "updatedAt", "id");
CREATE INDEX "Company_owner_scope_list_idx"
  ON "Company"("organizationId", "ownerId", "archivedAt", "updatedAt", "id");
CREATE INDEX "Company_active_updated_id_idx"
  ON "Company"("organizationId", "archivedAt", "updatedAt", "id");

DROP INDEX IF EXISTS "Contact_organizationId_teamId_ownerId_idx";
DROP INDEX IF EXISTS "Contact_organizationId_archivedAt_updatedAt_idx";
CREATE INDEX "Contact_team_scope_list_idx"
  ON "Contact"("organizationId", "teamId", "archivedAt", "updatedAt", "id");
CREATE INDEX "Contact_owner_scope_list_idx"
  ON "Contact"("organizationId", "ownerId", "archivedAt", "updatedAt", "id");
CREATE INDEX "Contact_active_updated_id_idx"
  ON "Contact"("organizationId", "archivedAt", "updatedAt", "id");

DROP INDEX IF EXISTS "Opportunity_organizationId_pipelineId_stageId_idx";
DROP INDEX IF EXISTS "Opportunity_organizationId_teamId_ownerId_idx";
DROP INDEX IF EXISTS "Opportunity_organizationId_createdAt_status_idx";
DROP INDEX IF EXISTS "Opportunity_organizationId_archivedAt_updatedAt_idx";
CREATE INDEX "Opportunity_kanban_idx"
  ON "Opportunity"("organizationId", "pipelineId", "status", "archivedAt", "updatedAt", "id");
CREATE INDEX "Opportunity_team_scope_list_idx"
  ON "Opportunity"("organizationId", "teamId", "archivedAt", "updatedAt", "id");
CREATE INDEX "Opportunity_owner_scope_list_idx"
  ON "Opportunity"("organizationId", "ownerId", "archivedAt", "updatedAt", "id");
CREATE INDEX "Opportunity_org_created_idx"
  ON "Opportunity"("organizationId", "createdAt");
CREATE INDEX "Opportunity_active_updated_id_idx"
  ON "Opportunity"("organizationId", "archivedAt", "updatedAt", "id");
CREATE INDEX "Opportunity_stageId_idx" ON "Opportunity"("stageId");

CREATE INDEX "Task_team_status_due_idx"
  ON "Task"("organizationId", "teamId", "status", "dueAt");
CREATE INDEX "Task_org_due_idx" ON "Task"("organizationId", "dueAt");
CREATE INDEX "Task_assignee_due_idx"
  ON "Task"("organizationId", "assigneeId", "dueAt");
CREATE INDEX "Task_team_due_idx"
  ON "Task"("organizationId", "teamId", "dueAt");

CREATE INDEX "CompanyTag_tagId_idx" ON "CompanyTag"("tagId");
CREATE INDEX "OpportunityTag_tagId_idx" ON "OpportunityTag"("tagId");
CREATE INDEX "Segment_org_updated_idx" ON "Segment"("organizationId", "updatedAt", "id");
CREATE INDEX "SegmentMember_contactId_idx" ON "SegmentMember"("contactId");
CREATE INDEX "WhatsappInstanceTeam_teamId_idx" ON "WhatsappInstanceTeam"("teamId");

DROP INDEX IF EXISTS "Conversation_organizationId_status_lastMessageAt_idx";
DROP INDEX IF EXISTS "Conversation_assigneeId_status_idx";
CREATE INDEX "Conversation_org_status_recent_idx"
  ON "Conversation"("organizationId", "status", "lastMessageAt", "id");
CREATE INDEX "Conversation_assignee_status_recent_idx"
  ON "Conversation"("assigneeId", "status", "lastMessageAt", "id");
CREATE INDEX "Conversation_contact_idx" ON "Conversation"("contactId");

DROP INDEX IF EXISTS "ConversationEvent_conversationId_createdAt_idx";
CREATE INDEX "ConversationEvent_page_idx"
  ON "ConversationEvent"("conversationId", "createdAt", "id");

DROP INDEX IF EXISTS "Message_conversationId_createdAt_idx";
CREATE INDEX "Message_page_idx"
  ON "Message"("conversationId", "createdAt", "id");
CREATE INDEX "Message_retention_idx" ON "Message"("createdAt", "id");

DROP INDEX IF EXISTS "Campaign_organizationId_archivedAt_createdAt_idx";
CREATE INDEX "Campaign_active_created_idx"
  ON "Campaign"("organizationId", "archivedAt", "createdAt", "id");
CREATE INDEX "Campaign_owner_created_idx"
  ON "Campaign"("createdById", "archivedAt", "createdAt", "id");

DROP INDEX IF EXISTS "CampaignRecipient_campaignId_status_scheduledAt_idx";
CREATE INDEX "CampaignRecipient_dispatch_idx"
  ON "CampaignRecipient"("campaignId", "status", "createdAt", "id");

DROP INDEX IF EXISTS "Notification_userId_readAt_createdAt_idx";
CREATE INDEX "Notification_unread_recent_idx"
  ON "Notification"("userId", "readAt", "createdAt", "id");

CREATE INDEX "Workflow_org_updated_idx"
  ON "Workflow"("organizationId", "updatedAt", "id");
CREATE INDEX "Workflow_owner_updated_idx"
  ON "Workflow"("createdById", "updatedAt", "id");
CREATE INDEX "Chatbot_owner_updated_idx"
  ON "Chatbot"("createdById", "updatedAt", "id");
CREATE INDEX "EmailTemplate_org_updated_idx"
  ON "EmailTemplate"("organizationId", "updatedAt", "id");
