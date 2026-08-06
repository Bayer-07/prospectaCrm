ALTER TABLE "Company"
ADD COLUMN "linkedinUrl" TEXT,
ADD COLUMN "logoId" UUID;

CREATE UNIQUE INDEX "Company_logoId_key" ON "Company"("logoId");

ALTER TABLE "Company"
ADD CONSTRAINT "Company_logoId_fkey"
FOREIGN KEY ("logoId") REFERENCES "MediaAsset"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
