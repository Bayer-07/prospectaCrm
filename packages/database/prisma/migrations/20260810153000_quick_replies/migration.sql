CREATE TABLE "QuickReply" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "mediaAssetId" UUID,
    "title" TEXT NOT NULL,
    "shortcut" TEXT NOT NULL,
    "text" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuickReply_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuickReply_mediaAssetId_key" ON "QuickReply"("mediaAssetId");
CREATE UNIQUE INDEX "QuickReply_organizationId_shortcut_key" ON "QuickReply"("organizationId", "shortcut");
CREATE INDEX "QuickReply_org_title_idx" ON "QuickReply"("organizationId", "title", "id");

ALTER TABLE "QuickReply"
ADD CONSTRAINT "QuickReply_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QuickReply"
ADD CONSTRAINT "QuickReply_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "QuickReply"
ADD CONSTRAINT "QuickReply_mediaAssetId_fkey"
FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
