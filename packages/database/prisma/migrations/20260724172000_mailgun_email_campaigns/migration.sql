ALTER TABLE "Campaign"
ADD COLUMN "emailSubject" TEXT;

ALTER TABLE "CampaignRecipient"
ADD COLUMN "providerMessageId" TEXT,
ADD COLUMN "deliveredAt" TIMESTAMP(3),
ADD COLUMN "openedAt" TIMESTAMP(3),
ADD COLUMN "clickedAt" TIMESTAMP(3),
ADD COLUMN "failedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "CampaignRecipient_providerMessageId_key"
ON "CampaignRecipient"("providerMessageId");

CREATE TABLE "EmailDeliveryEvent" (
  "id" UUID NOT NULL,
  "recipientId" UUID NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "severity" TEXT,
  "recipientEmail" TEXT,
  "payload" JSONB NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmailDeliveryEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmailDeliveryEvent_recipientId_fkey"
    FOREIGN KEY ("recipientId")
    REFERENCES "CampaignRecipient"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "EmailDeliveryEvent_providerEventId_key"
ON "EmailDeliveryEvent"("providerEventId");

CREATE INDEX "EmailDeliveryEvent_recipientId_occurredAt_idx"
ON "EmailDeliveryEvent"("recipientId", "occurredAt");
