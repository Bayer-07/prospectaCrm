-- Structured commercial activities and organization-safe timeline queries.
CREATE TYPE "ActivityCategory" AS ENUM ('CALL', 'NOTE', 'MEETING', 'TASK', 'WHATSAPP', 'EMAIL', 'SYSTEM');
CREATE TYPE "ActivityOrigin" AS ENUM ('MANUAL', 'INBOX', 'CAMPAIGN', 'AUTOMATION', 'SYSTEM');
CREATE TYPE "ActivityStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'SENT', 'DELIVERED', 'READ', 'REPLIED', 'FAILED', 'CANCELLED');
CREATE TYPE "ActivityDirection" AS ENUM ('INBOUND', 'OUTBOUND');

ALTER TABLE "Activity"
  ADD COLUMN "organizationId" UUID,
  ADD COLUMN "teamId" UUID,
  ADD COLUMN "category" "ActivityCategory" NOT NULL DEFAULT 'SYSTEM',
  ADD COLUMN "origin" "ActivityOrigin" NOT NULL DEFAULT 'SYSTEM',
  ADD COLUMN "status" "ActivityStatus" NOT NULL DEFAULT 'COMPLETED',
  ADD COLUMN "direction" "ActivityDirection",
  ADD COLUMN "body" TEXT,
  ADD COLUMN "outcome" TEXT,
  ADD COLUMN "durationSeconds" INTEGER,
  ADD COLUMN "sourceType" TEXT,
  ADD COLUMN "sourceId" TEXT,
  ADD COLUMN "scheduledAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

UPDATE "Activity" AS activity
SET
  "organizationId" = COALESCE(
    (SELECT "organizationId" FROM "User" WHERE "id" = activity."userId"),
    (SELECT "organizationId" FROM "Company" WHERE "id" = activity."companyId"),
    (SELECT "organizationId" FROM "Contact" WHERE "id" = activity."contactId"),
    (SELECT "organizationId" FROM "Opportunity" WHERE "id" = activity."opportunityId")
  ),
  "teamId" = COALESCE(
    (SELECT "teamId" FROM "User" WHERE "id" = activity."userId"),
    (SELECT "teamId" FROM "Company" WHERE "id" = activity."companyId"),
    (SELECT "teamId" FROM "Contact" WHERE "id" = activity."contactId"),
    (SELECT "teamId" FROM "Opportunity" WHERE "id" = activity."opportunityId")
  ),
  "createdAt" = activity."occurredAt",
  "updatedAt" = activity."occurredAt";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Activity" WHERE "organizationId" IS NULL) THEN
    RAISE EXCEPTION 'Activity sem organização; corrija o vínculo antes de aplicar a migração';
  END IF;
END $$;

ALTER TABLE "Activity" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "Activity" DROP CONSTRAINT "Activity_companyId_fkey";
ALTER TABLE "Activity" DROP CONSTRAINT "Activity_contactId_fkey";
ALTER TABLE "Activity" DROP CONSTRAINT "Activity_opportunityId_fkey";
ALTER TABLE "Activity"
  ADD CONSTRAINT "Activity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "Activity_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Activity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Activity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Activity_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX IF EXISTS "Activity_companyId_occurredAt_idx";
DROP INDEX IF EXISTS "Activity_contactId_occurredAt_idx";
DROP INDEX IF EXISTS "Activity_opportunityId_occurredAt_idx";
DROP INDEX IF EXISTS "Activity_userId_occurredAt_idx";

CREATE UNIQUE INDEX "Activity_organizationId_sourceType_sourceId_key"
  ON "Activity"("organizationId", "sourceType", "sourceId");
CREATE INDEX "Activity_org_timeline_idx"
  ON "Activity"("organizationId", "occurredAt" DESC, "id" DESC, "deletedAt");
CREATE INDEX "Activity_org_category_idx"
  ON "Activity"("organizationId", "category", "occurredAt" DESC, "deletedAt");
CREATE INDEX "Activity_team_scope_idx"
  ON "Activity"("organizationId", "teamId", "occurredAt" DESC, "deletedAt");
CREATE INDEX "Activity_user_scope_idx"
  ON "Activity"("organizationId", "userId", "occurredAt" DESC, "deletedAt");
CREATE INDEX "Activity_companyId_occurredAt_deletedAt_idx"
  ON "Activity"("companyId", "occurredAt" DESC, "deletedAt");
CREATE INDEX "Activity_contactId_occurredAt_deletedAt_idx"
  ON "Activity"("contactId", "occurredAt" DESC, "deletedAt");
CREATE INDEX "Activity_opportunityId_occurredAt_deletedAt_idx"
  ON "Activity"("opportunityId", "occurredAt" DESC, "deletedAt");

-- Legacy notes become first-class timeline entries.
INSERT INTO "Activity" (
  "id", "organizationId", "teamId", "userId", "companyId", "contactId", "opportunityId",
  "category", "origin", "status", "type", "title", "body", "sourceType", "sourceId",
  "occurredAt", "completedAt", "createdAt", "updatedAt", "details"
)
SELECT
  md5('activity-note:' || note."id"::text)::uuid,
  author."organizationId", author."teamId", note."authorId", note."companyId", note."contactId", note."opportunityId",
  'NOTE', 'MANUAL', 'COMPLETED', 'note.created', 'Nota adicionada', note."body", 'NOTE', note."id"::text,
  note."createdAt", note."createdAt", note."createdAt", note."updatedAt", '{}'::jsonb
FROM "Note" AS note
JOIN "User" AS author ON author."id" = note."authorId"
ON CONFLICT ("organizationId", "sourceType", "sourceId") DO NOTHING;

-- Existing tasks remain the source of truth and receive one idempotent timeline projection.
INSERT INTO "Activity" (
  "id", "organizationId", "teamId", "userId", "companyId", "contactId", "opportunityId",
  "category", "origin", "status", "type", "title", "body", "sourceType", "sourceId",
  "occurredAt", "scheduledAt", "completedAt", "createdAt", "updatedAt", "details"
)
SELECT
  md5('activity-task:' || task."id"::text)::uuid,
  task."organizationId", task."teamId", COALESCE(task."assigneeId", task."createdById"), task."companyId", task."contactId", task."opportunityId",
  'TASK', CASE WHEN follow_up."id" IS NULL THEN 'MANUAL'::"ActivityOrigin" ELSE 'AUTOMATION'::"ActivityOrigin" END,
  CASE task."status" WHEN 'OPEN' THEN 'SCHEDULED'::"ActivityStatus" WHEN 'COMPLETED' THEN 'COMPLETED'::"ActivityStatus" ELSE 'CANCELLED'::"ActivityStatus" END,
  'task', task."title", task."description", 'TASK', task."id"::text,
  task."createdAt", task."dueAt", task."completedAt", task."createdAt", task."updatedAt", '{}'::jsonb
FROM "Task" AS task
LEFT JOIN "ConversationFollowUp" AS follow_up ON follow_up."taskId" = task."id"
ON CONFLICT ("organizationId", "sourceType", "sourceId") DO NOTHING;

-- Only outbound WhatsApp messages created by BZS One are backfilled.
INSERT INTO "Activity" (
  "id", "organizationId", "teamId", "userId", "companyId", "contactId",
  "category", "origin", "status", "direction", "type", "title", "body", "sourceType", "sourceId",
  "occurredAt", "completedAt", "createdAt", "updatedAt", "details"
)
SELECT
  md5('activity-whatsapp:' || message."id"::text)::uuid,
  conversation."organizationId", conversation."teamId",
  COALESCE(
    CASE WHEN message."payload"->>'authorId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN (message."payload"->>'authorId')::uuid END,
    campaign."createdById"
  ),
  primary_company."companyId", conversation."contactId",
  'WHATSAPP',
  CASE
    WHEN message."payload" ? 'campaignId' THEN 'CAMPAIGN'::"ActivityOrigin"
    WHEN message."payload" ?| ARRAY['followUpId', 'enrollmentId', 'automated', 'aiGenerationId'] THEN 'AUTOMATION'::"ActivityOrigin"
    ELSE 'INBOX'::"ActivityOrigin"
  END,
  CASE message."status"
    WHEN 'READ' THEN 'READ'::"ActivityStatus"
    WHEN 'DELIVERED' THEN 'DELIVERED'::"ActivityStatus"
    WHEN 'REPLIED' THEN 'REPLIED'::"ActivityStatus"
    WHEN 'FAILED' THEN 'FAILED'::"ActivityStatus"
    ELSE 'SENT'::"ActivityStatus"
  END,
  'OUTBOUND', 'whatsapp.sent', 'Mensagem WhatsApp enviada', LEFT(message."text", 10000),
  'WHATSAPP_MESSAGE', message."id"::text,
  COALESCE(message."sentAt", message."createdAt"), COALESCE(message."sentAt", message."createdAt"), message."createdAt", message."updatedAt",
  jsonb_build_object('conversationId', message."conversationId", 'messageType', message."type")
FROM "Message" AS message
JOIN "Conversation" AS conversation ON conversation."id" = message."conversationId"
LEFT JOIN "Campaign" AS campaign
  ON message."payload"->>'campaignId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 AND campaign."id" = (message."payload"->>'campaignId')::uuid
LEFT JOIN LATERAL (
  SELECT link."companyId" FROM "ContactCompany" AS link
  WHERE link."contactId" = conversation."contactId" AND link."isPrimary" = true
  LIMIT 1
) AS primary_company ON true
WHERE message."direction" = 'OUTBOUND'
  AND message."sentAt" IS NOT NULL
  AND message."payload" ?| ARRAY['authorId', 'campaignId', 'followUpId', 'enrollmentId', 'automated', 'aiGenerationId']
ON CONFLICT ("organizationId", "sourceType", "sourceId") DO NOTHING;

-- Sent campaign e-mails receive a record per recipient.
INSERT INTO "Activity" (
  "id", "organizationId", "teamId", "userId", "companyId", "contactId",
  "category", "origin", "status", "direction", "type", "title", "body", "sourceType", "sourceId",
  "occurredAt", "completedAt", "createdAt", "updatedAt", "details"
)
SELECT
  md5('activity-email:' || recipient."id"::text)::uuid,
  campaign."organizationId", creator."teamId", campaign."createdById", primary_company."companyId", recipient."contactId",
  'EMAIL', 'CAMPAIGN',
  CASE recipient."status"
    WHEN 'READ' THEN 'READ'::"ActivityStatus"
    WHEN 'DELIVERED' THEN 'DELIVERED'::"ActivityStatus"
    WHEN 'REPLIED' THEN 'REPLIED'::"ActivityStatus"
    WHEN 'FAILED' THEN 'FAILED'::"ActivityStatus"
    ELSE 'SENT'::"ActivityStatus"
  END,
  'OUTBOUND', 'email.sent', COALESCE(campaign."emailSubject", 'E-mail enviado'), LEFT(bubble."content", 10000),
  'EMAIL_RECIPIENT', recipient."id"::text,
  recipient."sentAt", recipient."sentAt", recipient."createdAt", recipient."updatedAt",
  jsonb_build_object('campaignId', campaign."id", 'recipientId', recipient."id")
FROM "CampaignRecipient" AS recipient
JOIN "Campaign" AS campaign ON campaign."id" = recipient."campaignId" AND campaign."channel" = 'EMAIL'
JOIN "User" AS creator ON creator."id" = campaign."createdById"
LEFT JOIN LATERAL (
  SELECT link."companyId" FROM "ContactCompany" AS link
  WHERE link."contactId" = recipient."contactId" AND link."isPrimary" = true
  LIMIT 1
) AS primary_company ON true
LEFT JOIN LATERAL (
  SELECT item."content" FROM "CampaignBubble" AS item
  WHERE item."campaignId" = campaign."id"
  ORDER BY item."position" ASC
  LIMIT 1
) AS bubble ON true
WHERE recipient."sentAt" IS NOT NULL
ON CONFLICT ("organizationId", "sourceType", "sourceId") DO NOTHING;

-- Default permissions for system roles; custom roles can opt in through Settings.
INSERT INTO "RolePermission" ("id", "roleId", "resource", "action", "scope")
SELECT md5(role."id"::text || ':activities:read')::uuid, role."id", 'activities', 'read',
  CASE role."key" WHEN 'admin' THEN 'ALL'::"DataScope" WHEN 'manager' THEN 'TEAM'::"DataScope" WHEN 'sdr' THEN 'TEAM'::"DataScope" ELSE 'OWN'::"DataScope" END
FROM "Role" AS role
WHERE role."key" IN ('admin', 'manager', 'sdr', 'seller')
ON CONFLICT ("roleId", "resource", "action") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "resource", "action", "scope")
SELECT md5(role."id"::text || ':activities:write')::uuid, role."id", 'activities', 'write',
  CASE role."key" WHEN 'admin' THEN 'ALL'::"DataScope" WHEN 'manager' THEN 'TEAM'::"DataScope" ELSE 'OWN'::"DataScope" END
FROM "Role" AS role
WHERE role."key" IN ('admin', 'manager', 'sdr', 'seller')
ON CONFLICT ("roleId", "resource", "action") DO NOTHING;
