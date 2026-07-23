CREATE INDEX IF NOT EXISTS "OpportunityContact_contactId_idx"
ON "OpportunityContact"("contactId");

CREATE INDEX IF NOT EXISTS "WhatsappInstance_instanceKey_idx"
ON "WhatsappInstance"("instanceKey");

CREATE INDEX IF NOT EXISTS "Conversation_instanceId_contactId_idx"
ON "Conversation"("instanceId", "contactId");

CREATE INDEX IF NOT EXISTS "CampaignRecipient_contactId_status_idx"
ON "CampaignRecipient"("contactId", "status");

CREATE INDEX IF NOT EXISTS "WorkflowEnrollment_contactId_status_idx"
ON "WorkflowEnrollment"("contactId", "status");

CREATE INDEX IF NOT EXISTS "Opportunity_organizationId_createdAt_status_idx"
ON "Opportunity"("organizationId", "createdAt", "status");

CREATE INDEX IF NOT EXISTS "Task_organizationId_createdAt_status_idx"
ON "Task"("organizationId", "createdAt", "status");

CREATE INDEX IF NOT EXISTS "Activity_userId_occurredAt_idx"
ON "Activity"("userId", "occurredAt");

CREATE INDEX IF NOT EXISTS "Conversation_organizationId_createdAt_status_idx"
ON "Conversation"("organizationId", "createdAt", "status");

CREATE INDEX IF NOT EXISTS "Campaign_organizationId_createdAt_idx"
ON "Campaign"("organizationId", "createdAt");

CREATE INDEX IF NOT EXISTS "Company_organizationId_archivedAt_updatedAt_idx"
ON "Company"("organizationId", "archivedAt", "updatedAt");

CREATE INDEX IF NOT EXISTS "Contact_organizationId_archivedAt_updatedAt_idx"
ON "Contact"("organizationId", "archivedAt", "updatedAt");

CREATE INDEX IF NOT EXISTS "Opportunity_organizationId_archivedAt_updatedAt_idx"
ON "Opportunity"("organizationId", "archivedAt", "updatedAt");

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Company_name_trgm_idx" ON "Company" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Company_domain_trgm_idx" ON "Company" USING GIN ("domain" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Company_cnpj_trgm_idx" ON "Company" USING GIN ("cnpj" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Contact_name_trgm_idx" ON "Contact" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Contact_email_trgm_idx" ON "Contact" USING GIN ("email" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Contact_phone_trgm_idx" ON "Contact" USING GIN ("phone" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Opportunity_title_trgm_idx" ON "Opportunity" USING GIN ("title" gin_trgm_ops);

ALTER TABLE "Campaign"
ADD COLUMN IF NOT EXISTS "sentRecipientCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "Campaign" AS campaign
SET "sentRecipientCount" = totals.total
FROM (
  SELECT "campaignId", COUNT(*)::integer AS total
  FROM "CampaignRecipient"
  WHERE "status" IN ('SENT', 'DELIVERED', 'READ', 'REPLIED')
  GROUP BY "campaignId"
) AS totals
WHERE campaign."id" = totals."campaignId";

CREATE INDEX IF NOT EXISTS "ContactCompany_companyId_idx" ON "ContactCompany"("companyId");
CREATE INDEX IF NOT EXISTS "Opportunity_companyId_idx" ON "Opportunity"("companyId");
CREATE INDEX IF NOT EXISTS "ContactTag_tagId_idx" ON "ContactTag"("tagId");
CREATE INDEX IF NOT EXISTS "Task_companyId_idx" ON "Task"("companyId");
CREATE INDEX IF NOT EXISTS "Task_contactId_idx" ON "Task"("contactId");
CREATE INDEX IF NOT EXISTS "Task_opportunityId_idx" ON "Task"("opportunityId");
CREATE INDEX IF NOT EXISTS "Note_companyId_idx" ON "Note"("companyId");
CREATE INDEX IF NOT EXISTS "Note_contactId_idx" ON "Note"("contactId");
CREATE INDEX IF NOT EXISTS "Note_opportunityId_idx" ON "Note"("opportunityId");

CREATE INDEX IF NOT EXISTS "Opportunity_organizationId_status_archivedAt_idx"
ON "Opportunity"("organizationId", "status", "archivedAt");
CREATE INDEX IF NOT EXISTS "Opportunity_organizationId_status_wonAt_idx"
ON "Opportunity"("organizationId", "status", "wonAt");
CREATE INDEX IF NOT EXISTS "Opportunity_organizationId_status_lostAt_idx"
ON "Opportunity"("organizationId", "status", "lostAt");
CREATE INDEX IF NOT EXISTS "Task_organizationId_status_dueAt_idx"
ON "Task"("organizationId", "status", "dueAt");
CREATE INDEX IF NOT EXISTS "Conversation_organizationId_closedAt_idx"
ON "Conversation"("organizationId", "closedAt");
