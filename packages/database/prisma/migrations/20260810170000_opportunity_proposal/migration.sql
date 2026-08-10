ALTER TABLE "Opportunity"
ADD COLUMN "proposalUrl" TEXT,
ADD COLUMN "proposalAssetId" UUID,
ADD COLUMN "proposalAddedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Opportunity_proposalAssetId_key" ON "Opportunity"("proposalAssetId");

ALTER TABLE "Opportunity"
ADD CONSTRAINT "Opportunity_proposalAssetId_fkey"
FOREIGN KEY ("proposalAssetId") REFERENCES "MediaAsset"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
