ALTER TABLE "Contact" ADD COLUMN "phoneKey" TEXT;

UPDATE "Contact"
SET "phoneKey" = phone
WHERE phone IS NOT NULL
  AND "archivedAt" IS NULL;

CREATE UNIQUE INDEX "Contact_organizationId_phoneKey_key"
ON "Contact"("organizationId", "phoneKey");
