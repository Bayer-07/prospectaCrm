-- Keep frequently rendered lists in their requested order inside the index.
-- Nullable archive/read markers come last so they do not force PostgreSQL to
-- sort every matching row before applying LIMIT.

DROP INDEX IF EXISTS "Company_team_scope_list_idx";
DROP INDEX IF EXISTS "Company_owner_scope_list_idx";
DROP INDEX IF EXISTS "Company_active_updated_id_idx";
CREATE INDEX "Company_team_scope_list_idx"
  ON "Company"("organizationId", "teamId", "updatedAt" DESC, "id" DESC, "archivedAt");
CREATE INDEX "Company_owner_scope_list_idx"
  ON "Company"("organizationId", "ownerId", "updatedAt" DESC, "id" DESC, "archivedAt");
CREATE INDEX "Company_active_updated_id_idx"
  ON "Company"("organizationId", "updatedAt" DESC, "id" DESC, "archivedAt");

DROP INDEX IF EXISTS "Contact_team_scope_list_idx";
DROP INDEX IF EXISTS "Contact_owner_scope_list_idx";
DROP INDEX IF EXISTS "Contact_active_updated_id_idx";
CREATE INDEX "Contact_team_scope_list_idx"
  ON "Contact"("organizationId", "teamId", "updatedAt" DESC, "id" DESC, "archivedAt");
CREATE INDEX "Contact_owner_scope_list_idx"
  ON "Contact"("organizationId", "ownerId", "updatedAt" DESC, "id" DESC, "archivedAt");
CREATE INDEX "Contact_active_updated_id_idx"
  ON "Contact"("organizationId", "updatedAt" DESC, "id" DESC, "archivedAt");

DROP INDEX IF EXISTS "Opportunity_kanban_idx";
DROP INDEX IF EXISTS "Opportunity_team_scope_list_idx";
DROP INDEX IF EXISTS "Opportunity_owner_scope_list_idx";
DROP INDEX IF EXISTS "Opportunity_active_updated_id_idx";
CREATE INDEX "Opportunity_kanban_idx"
  ON "Opportunity"("organizationId", "pipelineId", "status", "updatedAt" DESC, "id" DESC, "archivedAt");
CREATE INDEX "Opportunity_team_scope_list_idx"
  ON "Opportunity"("organizationId", "teamId", "updatedAt" DESC, "id" DESC, "archivedAt");
CREATE INDEX "Opportunity_owner_scope_list_idx"
  ON "Opportunity"("organizationId", "ownerId", "updatedAt" DESC, "id" DESC, "archivedAt");
CREATE INDEX "Opportunity_active_updated_id_idx"
  ON "Opportunity"("organizationId", "updatedAt" DESC, "id" DESC, "archivedAt");

DROP INDEX IF EXISTS "Segment_org_updated_idx";
CREATE INDEX "Segment_org_updated_idx"
  ON "Segment"("organizationId", "updatedAt" DESC, "id" DESC);

DROP INDEX IF EXISTS "Conversation_org_status_recent_idx";
DROP INDEX IF EXISTS "Conversation_assignee_status_recent_idx";
CREATE INDEX "Conversation_org_status_recent_idx"
  ON "Conversation"("organizationId", "status", "lastMessageAt" DESC, "id" DESC);
CREATE INDEX "Conversation_assignee_status_recent_idx"
  ON "Conversation"("assigneeId", "status", "lastMessageAt" DESC, "id" DESC);

DROP INDEX IF EXISTS "Message_page_idx";
CREATE INDEX "Message_page_idx"
  ON "Message"("conversationId", "createdAt" DESC, "id" DESC);

DROP INDEX IF EXISTS "Campaign_active_created_idx";
DROP INDEX IF EXISTS "Campaign_owner_created_idx";
CREATE INDEX "Campaign_active_created_idx"
  ON "Campaign"("organizationId", "createdAt" DESC, "id" DESC, "archivedAt");
CREATE INDEX "Campaign_owner_created_idx"
  ON "Campaign"("createdById", "createdAt" DESC, "id" DESC, "archivedAt");

DROP INDEX IF EXISTS "Notification_unread_recent_idx";
CREATE INDEX "Notification_recent_idx"
  ON "Notification"("userId", "createdAt" DESC, "id" DESC, "readAt");
CREATE INDEX "Notification_read_idx"
  ON "Notification"("userId", "readAt");

DROP INDEX IF EXISTS "Workflow_org_updated_idx";
DROP INDEX IF EXISTS "Workflow_owner_updated_idx";
CREATE INDEX "Workflow_org_updated_idx"
  ON "Workflow"("organizationId", "updatedAt" DESC, "id" DESC);
CREATE INDEX "Workflow_owner_updated_idx"
  ON "Workflow"("createdById", "updatedAt" DESC, "id" DESC);

CREATE INDEX "Chatbot_org_updated_idx"
  ON "Chatbot"("organizationId", "updatedAt" DESC, "id" DESC);
DROP INDEX IF EXISTS "Chatbot_owner_updated_idx";
CREATE INDEX "Chatbot_owner_updated_idx"
  ON "Chatbot"("createdById", "updatedAt" DESC, "id" DESC);

DROP INDEX IF EXISTS "EmailTemplate_org_updated_idx";
CREATE INDEX "EmailTemplate_org_updated_idx"
  ON "EmailTemplate"("organizationId", "updatedAt" DESC, "id" DESC);
