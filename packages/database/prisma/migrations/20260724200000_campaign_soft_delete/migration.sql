ALTER TABLE "Campaign"
ADD COLUMN "archivedAt" TIMESTAMP(3);

DROP INDEX IF EXISTS "Campaign_organizationId_createdAt_idx";

CREATE INDEX "Campaign_organizationId_archivedAt_createdAt_idx"
ON "Campaign"("organizationId", "archivedAt", "createdAt");
