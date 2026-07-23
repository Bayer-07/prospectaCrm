ALTER TABLE "WhatsappInstance" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "WhatsappInstance_organizationId_archivedAt_idx"
ON "WhatsappInstance"("organizationId", "archivedAt");
